import type { SynthParams } from "../types";

export interface HarmonicBin {
  bin: number;
  amplitude: number;
  hue: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  playheadPosition: number; // 0..1 normalized across canvas
  currentColumn: number;
}

export interface ExcitationEvent {
  column: number;
  energy: number;
}

function encodeWAV(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
): Blob {
  const numChannels = 2;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const numSamples = left.length;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sL = Math.max(-1, Math.min(1, left[i]));
    const sR = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7fff, true);
    offset += 2;
    view.setInt16(offset, sR < 0 ? sR * 0x8000 : sR * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function getWorkletUrl(): string {
  return `${window.location.origin}/spectral-paint-processor.js`;
}

const CANVAS_COLS = 128;
const CANVAS_BINS = 64;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private params: SynthParams | null = null;
  private masterGain: GainNode | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private initPromise: Promise<void> | null = null;
  private initFailed = false;

  // Playback scan state
  private scanRafId: number | null = null;
  private scanStartTime: number | null = null;
  private scanLastColumn = -1;
  private scanAmpGrid: Float32Array[] | null = null;
  private scanHueGrid: Uint8Array[] | null = null;
  private scanParams: SynthParams | null = null;
  private scanLoopStart = 0;
  private scanLoopEnd = 1;
  private scanDuration = 8; // seconds
  private scanSpeed = 1.0;

  // Preallocated column analysis buffer (no heap allocation during scan)
  private readonly colHarmonicEnergy = new Float32Array(CANVAS_BINS);

  // Callbacks
  public onPlayheadMove: ((position: number, column: number) => void) | null =
    null;
  public onExcitationEvent: ((column: number, energy: number) => void) | null =
    null;
  public onDebugData: ((data: DebugData) => void) | null = null;

  // Debug state
  private lastDebugUpdate = 0;
  private debugColumnEnergy = 0;
  private debugHarmonicEnergy = new Float32Array(CANVAS_BINS);

  /**
   * Call synchronously inside a user-gesture handler.
   */
  primeContext(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    this.ctx = new AudioContext({
      sampleRate: 44100,
      latencyHint: "interactive",
    });
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 3.5;
    this.masterGain.connect(this.ctx.destination);
    this.ctx.resume().catch(() => {});
  }

  async init(): Promise<void> {
    if (!this.ctx) {
      this.primeContext();
    }

    if (this.initFailed) {
      this.initPromise = null;
      this.initFailed = false;
      this.workletNode?.disconnect();
      this.workletNode = null;
    }

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      const ctx = this.ctx!;

      if (!this.masterGain) {
        this.masterGain = ctx.createGain();
        this.masterGain.gain.value = 3.5;
        // Always connect to speakers first
        this.masterGain.connect(ctx.destination);
      }

      const workletUrl = getWorkletUrl();
      await ctx.audioWorklet.addModule(workletUrl);

      this.workletNode = new AudioWorkletNode(ctx, "spectral-paint-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      // Listen for excitation events from worklet
      this.workletNode.port.onmessage = (e) => {
        if (e.data.type === "excitationEvent") {
          if (this.onExcitationEvent && this.scanLastColumn >= 0) {
            this.onExcitationEvent(this.scanLastColumn, e.data.energy);
          }
        }
      };

      // worklet -> masterGain -> speakers (ctx.destination)
      this.workletNode.connect(this.masterGain!);

      // Also branch masterGain -> streamDest for recording (parallel tap, not replacing speaker route)
      this.streamDest = ctx.createMediaStreamDestination();
      this.masterGain!.connect(this.streamDest);

      if (ctx.state === "suspended") {
        await ctx.resume();
      }
    })();

    try {
      await this.initPromise;
    } catch (e) {
      this.initFailed = true;
      this.initPromise = null;
      throw e;
    }
  }

  async ensureRunning(): Promise<void> {
    if (!this.ctx || !this.workletNode) {
      await this.init();
    }
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
    }
  }

  isReady(): boolean {
    return !!this.workletNode && this.ctx?.state === "running";
  }

  /**
   * Start the time-based column scanning playback.
   * This is the new primary playback method — replaces the old static play().
   */
  startPlaybackScan(
    ampGrid: Float32Array[],
    hueGrid: Uint8Array[],
    params: SynthParams,
  ): void {
    if (!this.workletNode) return;

    this.stopPlaybackScan();

    this.scanAmpGrid = ampGrid;
    this.scanHueGrid = hueGrid;
    this.scanParams = params;
    this.scanLoopStart = params.loopStart ?? 0;
    this.scanLoopEnd = params.loopEnd ?? 1;
    this.scanDuration = Math.max(1, params.canvasDuration ?? 8);
    this.scanSpeed = Math.max(0.1, params.playbackSpeed ?? 1.0);
    this.scanStartTime = performance.now();
    this.scanLastColumn = -1;

    this.updateParams(params);

    this._scheduleScan();
  }

  private _scheduleScan(): void {
    this.scanRafId = requestAnimationFrame(() => this._doScan());
  }

  private _doScan(): void {
    if (
      !this.workletNode ||
      !this.scanAmpGrid ||
      !this.scanHueGrid ||
      !this.scanParams
    )
      return;
    if (this.scanStartTime === null) return;

    const now = performance.now();
    const elapsed = (now - this.scanStartTime) / 1000; // seconds

    const loopStart = this.scanLoopStart;
    const loopEnd = Math.max(loopStart + 0.01, this.scanLoopEnd);
    const loopDuration =
      ((loopEnd - loopStart) * this.scanDuration) / this.scanSpeed;

    // Compute position within loop region
    const loopElapsed = elapsed % loopDuration;
    const loopProgress = loopElapsed / loopDuration; // 0..1 within loop region
    const playheadPosition = loopStart + loopProgress * (loopEnd - loopStart); // 0..1 of canvas

    const currentCol = Math.floor(playheadPosition * CANVAS_COLS);
    const clampedCol = Math.max(0, Math.min(CANVAS_COLS - 1, currentCol));

    // Fractional position within current column (for interpolation smoothing)
    const playheadFrac = playheadPosition * CANVAS_COLS - currentCol;

    // Notify UI of playhead position
    if (this.onPlayheadMove) {
      this.onPlayheadMove(playheadPosition, clampedCol);
    }

    // Only send column data when we move to a new column
    if (clampedCol !== this.scanLastColumn) {
      this.scanLastColumn = clampedCol;
      this._sendColumnData(clampedCol, playheadFrac);
    }

    this._scheduleScan();
  }

  /**
   * Extract pixel data from a canvas column and send to worklet.
   * Uses preallocated buffer — no heap allocation.
   */
  private _sendColumnData(col: number, playheadFrac: number): void {
    if (
      !this.workletNode ||
      !this.scanAmpGrid ||
      !this.scanHueGrid ||
      !this.scanParams
    )
      return;

    const ampCol = this.scanAmpGrid[col];
    const hueCol = this.scanHueGrid[col];

    // Build harmonic energy array from canvas column pixel data
    // Map CANVAS_BINS (32) -> CANVAS_BINS (64) by upsampling
    let maxEnergy = 0;
    let dominantHue = 0;
    let maxAmpBin = 0;

    const srcBins = ampCol ? ampCol.length : 0;
    const dstBins = CANVAS_BINS;

    this.colHarmonicEnergy.fill(0);

    for (let b = 0; b < srcBins; b++) {
      const amp = ampCol[b] ?? 0;
      if (amp < 0.002) continue;

      // Map source bin to destination (upsample from 32 to 64)
      const dstBin = Math.floor((b / srcBins) * dstBins);
      this.colHarmonicEnergy[dstBin] += amp;

      // Also add to adjacent bin for smoothing
      if (dstBin + 1 < dstBins) {
        this.colHarmonicEnergy[dstBin + 1] += amp * 0.5;
      }

      if (amp > maxAmpBin) {
        maxAmpBin = amp;
        dominantHue = hueCol?.[b] ?? 0;
      }
      if (this.colHarmonicEnergy[dstBin] > maxEnergy)
        maxEnergy = this.colHarmonicEnergy[dstBin];
    }

    // Debug: store for debug panel (throttled)
    const nowMs = performance.now();
    if (nowMs - this.lastDebugUpdate > 50) {
      this.lastDebugUpdate = nowMs;
      this.debugColumnEnergy = maxEnergy;
      this.debugHarmonicEnergy.set(this.colHarmonicEnergy);
      if (this.onDebugData) {
        this.onDebugData({
          columnEnergy: this.debugColumnEnergy,
          harmonicEnergy: Array.from(this.debugHarmonicEnergy),
          resonatorInputLevel: maxEnergy,
        });
      }
    }

    const panSpread = this.scanParams.panSpread ?? 0.3;

    // Transfer harmonic energy to worklet (Transferable for zero-copy)
    const energyCopy = new Float32Array(this.colHarmonicEnergy);
    this.workletNode.port.postMessage(
      {
        type: "setCanvasColumn",
        harmonicEnergy: energyCopy,
        playheadFrac,
        dominantHue,
        panSpread,
      },
      [energyCopy.buffer],
    );
  }

  stopPlaybackScan(): void {
    if (this.scanRafId !== null) {
      cancelAnimationFrame(this.scanRafId);
      this.scanRafId = null;
    }
    this.scanStartTime = null;
    this.scanLastColumn = -1;
  }

  /**
   * Legacy play() for draw-stroke triggered sound.
   * Reads the painted column directly near the brush position.
   */
  play(
    ampGrid: Float32Array[],
    hueGrid: Uint8Array[],
    cols: number,
    rows: number,
    params: SynthParams,
  ): void {
    if (!this.workletNode) return;
    this.params = params;

    this.updateParams(params);

    // Find a column with significant energy near the center
    let bestCol = Math.floor(cols / 2);
    let bestEnergy = 0;
    for (let c = 0; c < cols; c++) {
      let energy = 0;
      const ampCol = ampGrid[c];
      if (!ampCol) continue;
      for (let r = 0; r < rows; r++) energy += ampCol[r] ?? 0;
      if (energy > bestEnergy) {
        bestEnergy = energy;
        bestCol = c;
      }
    }

    if (bestEnergy < 0.01) {
      // Canvas is empty — trigger a default voice
      this._triggerDefaultVoice(params);
      return;
    }

    // Build bins from best column
    const bins: HarmonicBin[] = [];
    const ampCol = ampGrid[bestCol];
    const hueCol = hueGrid[bestCol];
    for (let r = 0; r < rows; r++) {
      const amp = ampCol?.[r] ?? 0;
      if (amp > 0.01) {
        bins.push({ bin: r, amplitude: amp, hue: hueCol?.[r] ?? 0 });
      }
    }

    let dominantHue = 0;
    let maxAmp = 0;
    for (const b of bins) {
      if (b.amplitude > maxAmp) {
        maxAmp = b.amplitude;
        dominantHue = b.hue;
      }
    }

    const excitationType = this.hueToExcitationType(dominantHue);
    const note = Math.round((bestCol / cols) * 36);

    this.workletNode.port.postMessage({
      type: "triggerVoice",
      bins,
      pan: 0,
      excitationType,
      amplitude: 1.0,
      note,
    });
  }

  private _triggerDefaultVoice(params: SynthParams): void {
    if (!this.workletNode) return;
    const sourceMap: Record<string, number> = {
      SpectralHarmonics: 0,
      NoiseBurst: 6,
      OscillatorStack: 2,
      AirFlow: 3,
      PulseStrike: 1,
    };
    const excitationType = sourceMap[params.excitationSource] ?? 0;
    const bins: HarmonicBin[] = [];
    const numBins = Math.max(4, Math.round(params.harmonicDensity * 16));
    for (let b = 0; b < numBins; b++) {
      const amp = (params.excitationEnergy ?? 0.8) * (1 - b / numBins) ** 1.5;
      if (amp > 0.02)
        bins.push({ bin: b, amplitude: amp, hue: excitationType * 45 });
    }
    this.workletNode.port.postMessage({
      type: "triggerVoice",
      bins,
      pan: 0,
      excitationType,
      amplitude: 1.0,
      note: 12,
    });
  }

  stop(): void {
    this.stopPlaybackScan();
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: "stopAll" });
  }

  hueToExcitationType(hue: number): number {
    if (hue < 15 || hue >= 345) return 0;
    if (hue < 45) return 1;
    if (hue < 90) return 2;
    if (hue < 150) return 3;
    if (hue < 225) return 4;
    if (hue < 285) return 5;
    return 6;
  }

  updateParams(params: SynthParams): void {
    if (!this.workletNode) return;
    this.params = params;

    const now = this.ctx!.currentTime;
    const node = this.workletNode;
    const setParam = (name: string, value: number) => {
      const p = node.parameters.get(name);
      if (p) p.setTargetAtTime(value, now, 0.02);
    };

    setParam("tension", params.tension);
    setParam("damping", params.damping);
    setParam("resonance", params.resonance);
    setParam("decayTime", params.decayTime);
    setParam("brightness", params.brightness);
    setParam("sustainEnergy", params.sustainEnergy);
    setParam("pickupPosition", params.pickupPosition);
    setParam("resonatorMorph", params.resonatorMorph);

    this.workletNode.port.postMessage({
      type: "updateParams",
      params: {
        filterType: ["Lowpass", "Bandpass", "Highpass"].indexOf(
          params.filterType,
        ),
        filterCutoff: params.filterCutoff,
        filterResonance: params.filterResonance,
        filterDrive: params.filterDrive,
        bodyModel: [
          "None",
          "GuitarBody",
          "ViolinBody",
          "PianoSoundboard",
          "WoodBox",
          "MetalChamber",
        ].indexOf(params.bodyModel),
        bodySize: params.bodySize,
        bodyMix: params.bodyMix,
        driftAmount: params.driftAmount,
        driftRate: params.driftRate,
        attack: params.attack,
        decay: params.decay,
        sustain: params.sustain,
        release: params.release,
        sustainEnergy: params.sustainEnergy,
        tension: params.tension,
        damping: params.damping,
        resonance: params.resonance,
        decayTime: params.decayTime,
        brightness: params.brightness,
        pickupPosition: params.pickupPosition,
        resonatorMorph: params.resonatorMorph,
        excitationEnergy: params.excitationEnergy,
        attackSharpness: params.attackSharpness,
        energyThreshold: params.energyThreshold ?? 0.12,
        amplitudeGain: params.amplitudeGain ?? 1.5,
        amplitudeFloor: params.amplitudeFloor ?? 0.05,
        impulseWidth: params.impulseWidth ?? 0.5,
        energyCompressor: params.energyCompressor ?? 0,
      },
    });

    // Update scan params if currently scanning
    if (this.scanParams) {
      this.scanParams = params;
      this.scanLoopStart = params.loopStart ?? 0;
      this.scanLoopEnd = params.loopEnd ?? 1;
      this.scanDuration = Math.max(1, params.canvasDuration ?? 8);
      this.scanSpeed = Math.max(0.1, params.playbackSpeed ?? 1.0);
    }
  }

  setEffect(name: string, enabled: boolean, mix: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: "setEffect",
      name,
      enabled,
      mix,
    });
  }

  startRecording(): void {
    if (!this.streamDest) return;
    this.recordedChunks = [];

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    this.mediaRecorder = new MediaRecorder(this.streamDest.stream, {
      mimeType,
    });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.start(100);
  }

  async stopRecordingAsync(): Promise<Blob | null> {
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive")
      return null;
    return new Promise<Blob>((resolve) => {
      this.mediaRecorder!.onstop = () => {
        const blob = new Blob(this.recordedChunks, {
          type: this.mediaRecorder!.mimeType,
        });
        resolve(blob);
      };
      this.mediaRecorder!.stop();
    });
  }

  async exportWAV(durationSec = 8): Promise<Blob | null> {
    if (!this.params) return null;
    try {
      const offlineCtx = new OfflineAudioContext(2, 44100 * durationSec, 44100);
      await offlineCtx.audioWorklet.addModule(getWorkletUrl());

      const offlineWorklet = new AudioWorkletNode(
        offlineCtx,
        "spectral-paint-processor",
        {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        },
      );

      offlineWorklet.connect(offlineCtx.destination);

      const params = this.params;
      offlineWorklet.port.postMessage({
        type: "updateParams",
        params: {
          filterType: ["Lowpass", "Bandpass", "Highpass"].indexOf(
            params.filterType,
          ),
          filterCutoff: params.filterCutoff,
          filterResonance: params.filterResonance,
          sustainEnergy: params.sustainEnergy,
          tension: params.tension,
          damping: params.damping,
          resonance: params.resonance,
          decayTime: params.decayTime,
          brightness: params.brightness,
          excitationEnergy: params.excitationEnergy,
          energyThreshold: params.energyThreshold ?? 0.12,
          amplitudeGain: params.amplitudeGain ?? 1.5,
          amplitudeFloor: params.amplitudeFloor ?? 0.05,
        },
      });

      // Trigger voices using canvas scan for accurate reproduction
      if (this.scanAmpGrid && this.scanHueGrid) {
        const scanDuration = params.canvasDuration ?? 8;
        const cols = CANVAS_COLS;
        const colInterval = (scanDuration / cols) * 44100;

        for (let c = 0; c < cols; c++) {
          const ampCol = this.scanAmpGrid[c];
          if (!ampCol) continue;

          let energy = 0;
          for (let b = 0; b < ampCol.length; b++) energy += ampCol[b];
          if (energy < 0.05) continue;

          const bins: HarmonicBin[] = [];
          for (let b = 0; b < ampCol.length; b++) {
            if (ampCol[b] > 0.01) {
              bins.push({
                bin: b,
                amplitude: ampCol[b],
                hue: this.scanHueGrid[c]?.[b] ?? 0,
              });
            }
          }

          offlineCtx.suspend((c * colInterval) / 44100).then(() => {
            offlineWorklet.port.postMessage({
              type: "triggerVoice",
              bins,
              pan: 0,
              excitationType: 0,
              amplitude: 1.0,
              note: 12,
            });
            offlineCtx.resume();
          });
        }
      }

      const buffer = await offlineCtx.startRendering();
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      return encodeWAV(left, right, 44100);
    } catch {
      return null;
    }
  }

  setMasterGain(value: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
    }
  }

  silenceVoices(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: "stopAll" });
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  destroy(): void {
    this.stopPlaybackScan();
    this.workletNode?.disconnect();
    this.ctx?.close();
    this.ctx = null;
    this.workletNode = null;
    this.initPromise = null;
  }
}

export interface DebugData {
  columnEnergy: number;
  harmonicEnergy: number[];
  resonatorInputLevel: number;
}

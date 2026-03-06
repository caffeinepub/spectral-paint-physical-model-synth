import type { SynthParams } from "../types";

export interface HarmonicBin {
  bin: number;
  amplitude: number;
  hue: number;
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

// Build an absolute URL to the worklet so it works both locally and on IC
function getWorkletUrl(): string {
  // Use origin-relative absolute URL to avoid path issues on IC
  return `${window.location.origin}/spectral-paint-processor.js`;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isPlaying = false;
  private params: SynthParams | null = null;
  private masterGain: GainNode | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private initPromise: Promise<void> | null = null;
  private initFailed = false;

  /**
   * Call synchronously inside a user-gesture handler to satisfy autoplay policy.
   * Creates the AudioContext and resumes it immediately.
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
    this.masterGain.gain.value = 0.7;
    this.masterGain.connect(this.ctx.destination);
    this.ctx.resume().catch(() => {});
  }

  /**
   * Loads the AudioWorklet module and wires up the node graph.
   * Resets and retries if previously failed.
   */
  async init(): Promise<void> {
    if (!this.ctx) {
      this.primeContext();
    }

    // If previously failed, reset so we can retry
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
        this.masterGain.gain.value = 0.7;
        this.masterGain.connect(ctx.destination);
      }

      // Load worklet using absolute origin URL — works on IC asset canister
      const workletUrl = getWorkletUrl();
      await ctx.audioWorklet.addModule(workletUrl);

      this.workletNode = new AudioWorkletNode(ctx, "spectral-paint-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      this.streamDest = ctx.createMediaStreamDestination();
      this.workletNode.connect(this.masterGain!);
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

  play(
    ampGrid: Float32Array[],
    hueGrid: Uint8Array[],
    cols: number,
    rows: number,
    params: SynthParams,
  ): void {
    if (!this.workletNode) return;
    this.params = params;
    this.isPlaying = true;

    const activeCols: number[] = [];
    for (let c = 0; c < cols; c++) {
      let totalAmp = 0;
      for (let r = 0; r < rows; r++) {
        totalAmp += ampGrid[c]?.[r] ?? 0;
      }
      if (totalAmp > 0.01) activeCols.push(c);
    }

    const voiceCount = Math.min(activeCols.length, 6);
    const stride = Math.max(1, Math.floor(activeCols.length / voiceCount));

    for (let vi = 0; vi < voiceCount; vi++) {
      const col = activeCols[vi * stride] ?? activeCols[vi];
      if (col === undefined) continue;

      const bins: HarmonicBin[] = [];
      for (let r = 0; r < rows; r++) {
        const amp = ampGrid[col]?.[r] ?? 0;
        if (amp > 0.01) {
          bins.push({
            bin: r,
            amplitude: amp,
            hue: hueGrid[col]?.[r] ?? 0,
          });
        }
      }

      if (bins.length === 0) continue;

      let dominantHue = 0;
      let maxAmp = 0;
      for (const b of bins) {
        if (b.amplitude > maxAmp) {
          maxAmp = b.amplitude;
          dominantHue = b.hue;
        }
      }

      const excitationType = this.hueToExcitationType(dominantHue);
      const note = Math.round((col / cols) * 36);
      const pan =
        (params.panSpread ?? 0) * ((vi / Math.max(1, voiceCount - 1)) * 2 - 1);

      this.workletNode.port.postMessage({
        type: "triggerVoice",
        bins,
        pan,
        excitationType,
        amplitude: 0.8,
        note,
      });
    }
  }

  stop(): void {
    if (!this.workletNode) return;
    this.isPlaying = false;
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
      },
    });
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

  async exportWAV(durationSec = 5): Promise<Blob | null> {
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

      if (this.params) {
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
          },
        });
      }

      const buffer = await offlineCtx.startRendering();
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      return encodeWAV(left, right, 44100);
    } catch {
      return null;
    }
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  destroy(): void {
    this.workletNode?.disconnect();
    this.ctx?.close();
    this.ctx = null;
    this.workletNode = null;
    this.initPromise = null;
  }
}

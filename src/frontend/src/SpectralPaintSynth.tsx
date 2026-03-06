import { Toaster } from "@/components/ui/sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AudioEngine } from "./audio/AudioEngine";
import { FACTORY_PRESETS, PRESET_NAMES } from "./audio/presets";
import BodyPanel from "./components/BodyPanel";
import BrushPanel from "./components/BrushPanel";
import ChordPanel from "./components/ChordPanel";
import CollapsiblePanel from "./components/CollapsiblePanel";
import ColorPanel from "./components/ColorPanel";
import DriftPanel from "./components/DriftPanel";
import EffectsPanel from "./components/EffectsPanel";
import EnvelopePanel from "./components/EnvelopePanel";
import ExcitationPanel from "./components/ExcitationPanel";
import FilterPanel from "./components/FilterPanel";
import LFOPanel from "./components/LFOPanel";
import ResonatorPanel from "./components/ResonatorPanel";
import SpectralCanvas, {
  CANVAS_COLS,
  CANVAS_BINS,
} from "./components/SpectralCanvas";
import SpectralModifiersPanel from "./components/SpectralModifiersPanel";
import TopBar from "./components/TopBar";
import type { BrushState, SynthParams } from "./types";

const DEFAULT_PARAMS: SynthParams = FACTORY_PRESETS["Harmonic Harp"];

function randomizeParams(): SynthParams {
  const presets = Object.values(FACTORY_PRESETS);
  const p1 = presets[Math.floor(Math.random() * presets.length)];
  const p2 = presets[Math.floor(Math.random() * presets.length)];
  const lerp = (a: number, b: number) => a + Math.random() * (b - a);
  return {
    ...p1,
    tension: lerp(p1.tension, p2.tension),
    damping: lerp(p1.damping, p2.damping),
    resonance: lerp(p1.resonance, p2.resonance),
    decayTime: lerp(p1.decayTime, p2.decayTime),
    brightness: lerp(p1.brightness, p2.brightness),
    sustainEnergy: lerp(p1.sustainEnergy, p2.sustainEnergy),
    filterCutoff: lerp(p1.filterCutoff, p2.filterCutoff),
    filterResonance: lerp(p1.filterResonance, p2.filterResonance),
    chorusEnabled: Math.random() > 0.5,
    delayEnabled: Math.random() > 0.6,
    reverbEnabled: Math.random() > 0.4,
  };
}

// Seed the canvas with some initial spectral content
function seedCanvas(ampGrid: Float32Array[], hueGrid: Uint8Array[]) {
  // Paint a few harmonic strokes for visual appeal
  const strokes = [
    { col: 20, row: 8, hue: 240, amp: 0.85, spread: 3 },
    { col: 35, row: 12, hue: 60, amp: 0.7, spread: 2 },
    { col: 55, row: 6, hue: 120, amp: 0.9, spread: 4 },
    { col: 70, row: 18, hue: 270, amp: 0.75, spread: 3 },
    { col: 85, row: 10, hue: 0, amp: 0.8, spread: 2 },
    { col: 100, row: 15, hue: 30, amp: 0.65, spread: 3 },
    { col: 115, row: 22, hue: 180, amp: 0.7, spread: 2 },
  ];

  for (const stroke of strokes) {
    // Draw gaussian peak
    for (let c = stroke.col - 8; c <= stroke.col + 8; c++) {
      if (c < 0 || c >= CANVAS_COLS) continue;
      if (!ampGrid[c]) ampGrid[c] = new Float32Array(CANVAS_BINS);
      if (!hueGrid[c]) hueGrid[c] = new Uint8Array(CANVAS_BINS);
      for (
        let r = stroke.row - stroke.spread;
        r <= stroke.row + stroke.spread;
        r++
      ) {
        if (r < 0 || r >= CANVAS_BINS) continue;
        const distC = (c - stroke.col) / 8;
        const distR = (r - stroke.row) / stroke.spread;
        const g = Math.exp(-(distC * distC + distR * distR) * 4) * stroke.amp;
        ampGrid[c][r] = Math.max(ampGrid[c][r], g);
        hueGrid[c][r] = stroke.hue;
        // Add harmonic overtones
        for (let h = 2; h <= 4; h++) {
          const hr = stroke.row + (h - 1) * 3;
          if (hr < CANVAS_BINS) {
            const hg = g * (1 / h);
            ampGrid[c][hr] = Math.max(ampGrid[c][hr], hg);
            hueGrid[c][hr] = (stroke.hue + 20) % 360;
          }
        }
      }
    }
  }
}

export default function SpectralPaintSynth() {
  const [params, setParams] = useState<SynthParams>(DEFAULT_PARAMS);
  const [brush, setBrush] = useState<BrushState>({
    type: "HARMONIC",
    size: 3,
    hue: 240,
    saturation: 0.9,
    brightness: 0.85,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<string | null>(
    "Harmonic Harp",
  );
  const [allPresets, setAllPresets] = useState<string[]>(PRESET_NAMES);

  const engineRef = useRef<AudioEngine | null>(null);
  const ampGridRef = useRef<Float32Array[]>([]);
  const hueGridRef = useRef<Uint8Array[]>([]);
  const drawCountRef = useRef(0);

  // Initialize grids with sample content
  useEffect(() => {
    ampGridRef.current = Array.from(
      { length: CANVAS_COLS },
      () => new Float32Array(CANVAS_BINS),
    );
    hueGridRef.current = Array.from(
      { length: CANVAS_COLS },
      () => new Uint8Array(CANVAS_BINS),
    );
    seedCanvas(ampGridRef.current, hueGridRef.current);
  }, []);

  const handlePlay = useCallback(async () => {
    try {
      // Prime synchronously (satisfies autoplay policy) then finish async init
      if (!engineRef.current) engineRef.current = new AudioEngine();
      engineRef.current.primeContext();
      await engineRef.current.ensureRunning();
      engineRef.current.play(
        ampGridRef.current,
        hueGridRef.current,
        CANVAS_COLS,
        CANVAS_BINS,
        params,
      );
      setIsPlaying(true);
      toast.success("Playing");
    } catch (err) {
      console.error("Audio play error:", err);
      toast.error("Audio error — tap again to start");
    }
  }, [params]);

  const handleStop = useCallback(() => {
    engineRef.current?.stop();
    setIsPlaying(false);
  }, []);

  const handleRecord = useCallback(async () => {
    if (isRecording) {
      const blob = await engineRef.current?.stopRecordingAsync();
      setIsRecording(false);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `spectral-paint-${Date.now()}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        toast.success("Recording saved");
      }
    } else {
      if (!engineRef.current) engineRef.current = new AudioEngine();
      engineRef.current.primeContext();
      await engineRef.current.ensureRunning();
      engineRef.current.startRecording();
      setIsRecording(true);
      toast.success("Recording started");
    }
  }, [isRecording]);

  const handleSaveWav = useCallback(async () => {
    toast.info("Exporting WAV...");
    if (!engineRef.current) engineRef.current = new AudioEngine();
    engineRef.current.primeContext();
    await engineRef.current.ensureRunning();
    const blob = await engineRef.current?.exportWAV(5);
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `spectral-paint-${Date.now()}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success("WAV exported");
    } else {
      toast.error("WAV export failed");
    }
  }, []);

  const handleSaveMp3 = useCallback(async () => {
    if (!MediaRecorder.isTypeSupported("audio/mpeg")) {
      toast.info("MP3 not supported — saving as WebM");
    }
    if (!engineRef.current) engineRef.current = new AudioEngine();
    engineRef.current.primeContext();
    await engineRef.current.ensureRunning();
    engineRef.current.startRecording();
    toast.info("Recording 5s for export...");
    setTimeout(async () => {
      const blob = await engineRef.current?.stopRecordingAsync();
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `spectral-paint-${Date.now()}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        toast.success("Audio exported");
      }
    }, 5000);
  }, []);

  const handleLoadPreset = useCallback((name: string) => {
    const preset = FACTORY_PRESETS[name];
    if (preset) {
      setParams(preset);
      setCurrentPreset(name);
      engineRef.current?.updateParams(preset);
      toast.success(`Loaded: ${name}`);
    }
  }, []);

  const handleSavePreset = useCallback(
    (name: string) => {
      // Store locally (in real app would use backend)
      FACTORY_PRESETS[name] = { ...params };
      if (!allPresets.includes(name)) {
        setAllPresets((prev) => [...prev, name]);
      }
      setCurrentPreset(name);
    },
    [params, allPresets],
  );

  const handleRandomPatch = useCallback(() => {
    const rnd = randomizeParams();
    setParams(rnd);
    setCurrentPreset(null);
    engineRef.current?.updateParams(rnd);
    toast.success("Random patch generated");
  }, []);

  const handleParamsChange = useCallback((updates: Partial<SynthParams>) => {
    setParams((prev) => {
      const next = { ...prev, ...updates };
      // Send effect updates immediately
      if ("chorusEnabled" in updates || "chorusMix" in updates) {
        engineRef.current?.setEffect(
          "chorus",
          next.chorusEnabled,
          next.chorusMix,
        );
      }
      if ("delayEnabled" in updates || "delayMix" in updates) {
        engineRef.current?.setEffect("delay", next.delayEnabled, next.delayMix);
      }
      if ("reverbEnabled" in updates || "reverbMix" in updates) {
        engineRef.current?.setEffect(
          "reverb",
          next.reverbEnabled,
          next.reverbMix,
        );
      }
      engineRef.current?.updateParams(next);
      return next;
    });
  }, []);

  const handleColorPick = useCallback((hue: number, brightness: number) => {
    setBrush((prev) => ({ ...prev, hue, brightness }));
  }, []);

  const handleDraw = useCallback(() => {
    drawCountRef.current++;
    // Prime audio context synchronously on first draw (user gesture is active here)
    if (!engineRef.current) engineRef.current = new AudioEngine();
    engineRef.current.primeContext();

    // Auto-trigger sound every few strokes while not in manual play mode
    if (!isPlaying && drawCountRef.current % 4 === 0) {
      engineRef.current
        .ensureRunning()
        .then(() => {
          if (engineRef.current?.isReady()) {
            engineRef.current.play(
              ampGridRef.current,
              hueGridRef.current,
              CANVAS_COLS,
              CANVAS_BINS,
              params,
            );
          }
        })
        .catch(() => {});
    }
  }, [isPlaying, params]);

  // Cleanup
  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
    };
  }, []);

  const chordParams = {
    chordMode: params.chordMode,
    chordType: params.chordType,
    chordInversion: params.chordInversion,
    chordSpread: params.chordSpread,
    chordSize: params.chordSize,
    scaleLock: params.scaleLock,
    rootNote: params.rootNote,
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground">
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{ className: "font-mono text-xs" }}
      />

      {/* Top Bar */}
      <TopBar
        isPlaying={isPlaying}
        isRecording={isRecording}
        onPlay={handlePlay}
        onStop={handleStop}
        onRecord={handleRecord}
        onSaveWav={handleSaveWav}
        onSaveMp3={handleSaveMp3}
        onLoadPreset={handleLoadPreset}
        onSavePreset={handleSavePreset}
        onRandomPatch={handleRandomPatch}
        presetNames={allPresets}
        currentPreset={currentPreset}
      />

      {/* Canvas Area */}
      <div className="relative flex-shrink-0" style={{ height: "42vh" }}>
        {/* Spectral Paint Label */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className="text-[9px] font-mono tracking-[0.4em] text-synth-glow/70 uppercase spectral-glow">
            SPECTRAL PAINT
          </span>
        </div>

        <SpectralCanvas
          brush={brush}
          onColorPick={handleColorPick}
          chordParams={chordParams}
          ampGridRef={ampGridRef}
          hueGridRef={hueGridRef}
          onDraw={handleDraw}
        />
      </div>

      {/* Brush + Color row */}
      <div
        className="flex flex-shrink-0 border-t border-b border-synth-border"
        style={{ maxHeight: "28vh" }}
      >
        <div className="w-1/2 border-r border-synth-border overflow-auto">
          <BrushPanel
            brush={brush}
            onChange={(updates) =>
              setBrush((prev) => ({ ...prev, ...updates }))
            }
          />
        </div>
        <div className="w-1/2 overflow-auto">
          <ColorPanel
            brush={brush}
            onChange={(updates) =>
              setBrush((prev) => ({ ...prev, ...updates }))
            }
          />
        </div>
      </div>

      {/* Collapsible Parameter Panels */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ scrollbarGutter: "stable" }}
      >
        <CollapsiblePanel
          title="Chord Engine"
          dataOcid="chord.panel"
          accentColor="oklch(0.72 0.22 280)"
        >
          <ChordPanel params={params} onChange={handleParamsChange} />
        </CollapsiblePanel>

        <CollapsiblePanel title="Spectral Modifiers">
          <SpectralModifiersPanel
            params={params}
            onChange={handleParamsChange}
          />
        </CollapsiblePanel>

        <CollapsiblePanel title="Excitation" defaultOpen>
          <ExcitationPanel params={params} onChange={handleParamsChange} />
        </CollapsiblePanel>

        <CollapsiblePanel
          title="Resonator"
          dataOcid="resonator.panel"
          defaultOpen
          accentColor="oklch(0.75 0.2 160)"
        >
          <ResonatorPanel params={params} onChange={handleParamsChange} />
        </CollapsiblePanel>

        <CollapsiblePanel title="Body Resonance">
          <BodyPanel params={params} onChange={handleParamsChange} />
        </CollapsiblePanel>

        <CollapsiblePanel title="Analog Drift">
          <DriftPanel params={params} onChange={handleParamsChange} />
        </CollapsiblePanel>

        <CollapsiblePanel title="Filter">
          <FilterPanel params={params} onChange={handleParamsChange} />
        </CollapsiblePanel>

        <CollapsiblePanel title="Envelope (ADSR)">
          <EnvelopePanel params={params} onChange={handleParamsChange} />
        </CollapsiblePanel>

        <CollapsiblePanel title="LFO Modulation">
          <LFOPanel params={params} onChange={handleParamsChange} />
        </CollapsiblePanel>

        <CollapsiblePanel title="Effects" accentColor="oklch(0.7 0.25 220)">
          <EffectsPanel params={params} onChange={handleParamsChange} />
        </CollapsiblePanel>

        {/* Footer */}
        <div className="px-3 py-2 text-center">
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-synth-dim hover:text-muted-foreground transition-colors"
          >
            © {new Date().getFullYear()}. Built with ♥ using caffeine.ai
          </a>
        </div>
      </div>
    </div>
  );
}

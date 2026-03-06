import { Shuffle } from "lucide-react";
import type { BrushState } from "../types";

interface ColorPanelProps {
  brush: BrushState;
  onChange: (updates: Partial<BrushState>) => void;
}

const HUE_LABELS: { hue: number; label: string; color: string }[] = [
  { hue: 0, label: "STRING", color: "#ff4040" },
  { hue: 30, label: "PLUCK", color: "#ff8020" },
  { hue: 60, label: "BRASS", color: "#ffee20" },
  { hue: 120, label: "FLUTE", color: "#40e060" },
  { hue: 240, label: "BELL", color: "#4080ff" },
  { hue: 270, label: "GLASS", color: "#a040ff" },
];

function hsvToHex(hInput: number, s: number, v: number): string {
  const h = hInput % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (val: number) =>
    Math.round((val + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export default function ColorPanel({ brush, onChange }: ColorPanelProps) {
  const currentColor = hsvToHex(brush.hue, brush.saturation, brush.brightness);

  const handleRandomize = () => {
    onChange({
      hue: Math.random() * 360,
      saturation: 0.5 + Math.random() * 0.5,
      brightness: 0.5 + Math.random() * 0.5,
    });
  };

  return (
    <div data-ocid="color.panel" className="flex flex-col gap-2 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-synth-dim tracking-widest uppercase">
          Color / Excitation
        </span>
        <button
          type="button"
          onClick={handleRandomize}
          className="flex items-center gap-1 text-[10px] font-mono text-synth-dim hover:text-accent transition-colors"
          title="Randomize color"
        >
          <Shuffle className="w-3 h-3" />
          RND
        </button>
      </div>

      {/* Color preview */}
      <div
        className="w-full h-6 rounded border border-synth-border"
        style={{
          backgroundColor: currentColor,
          boxShadow: `0 0 8px ${currentColor}60`,
        }}
      />

      {/* Hue selector */}
      <div>
        <span className="text-[10px] font-mono text-synth-dim">HUE</span>
        <div className="relative mt-1">
          <div className="h-3 w-full rounded hue-gradient border border-synth-border/50" />
          <input
            id="hue-range"
            type="range"
            aria-label="Hue"
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            min={0}
            max={360}
            step={1}
            value={brush.hue}
            onChange={(e) => onChange({ hue: Number(e.target.value) })}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-4 border-2 border-white rounded-sm pointer-events-none"
            style={{
              left: `${(brush.hue / 360) * 100}%`,
              transform: "translateX(-50%) translateY(-50%)",
              backgroundColor: hsvToHex(brush.hue, 1, 1),
            }}
          />
        </div>
      </div>

      {/* Saturation */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-synth-dim w-8">SAT</span>
        <input
          type="range"
          aria-label="Saturation"
          className="synth-slider flex-1"
          min={0}
          max={1}
          step={0.01}
          value={brush.saturation}
          onChange={(e) => onChange({ saturation: Number(e.target.value) })}
          style={
            {
              "--progress": `${brush.saturation * 100}%`,
            } as React.CSSProperties
          }
        />
        <span className="text-[10px] font-mono text-muted-foreground w-6 text-right">
          {Math.round(brush.saturation * 100)}
        </span>
      </div>

      {/* Brightness */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-synth-dim w-8">AMP</span>
        <input
          type="range"
          aria-label="Amplitude/Brightness"
          className="synth-slider flex-1"
          min={0}
          max={1}
          step={0.01}
          value={brush.brightness}
          onChange={(e) => onChange({ brightness: Number(e.target.value) })}
          style={
            {
              "--progress": `${brush.brightness * 100}%`,
            } as React.CSSProperties
          }
        />
        <span className="text-[10px] font-mono text-muted-foreground w-6 text-right">
          {Math.round(brush.brightness * 100)}
        </span>
      </div>

      {/* Quick color presets */}
      <div className="flex gap-1 flex-wrap mt-1">
        {HUE_LABELS.map(({ hue, label, color }) => (
          <button
            type="button"
            key={hue}
            onClick={() => onChange({ hue, saturation: 0.9, brightness: 0.85 })}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono border border-synth-border/50 hover:border-synth-border transition-all"
            style={{
              backgroundColor: `${color}20`,
              borderColor: Math.abs(brush.hue - hue) < 20 ? color : undefined,
              color: color,
            }}
            title={label}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

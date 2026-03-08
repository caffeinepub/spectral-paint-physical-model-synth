import type { BrushState, BrushType } from "../types";

interface BrushPanelProps {
  brush: BrushState;
  onChange: (updates: Partial<BrushState>) => void;
}

const BRUSHES: {
  type: BrushType;
  label: string;
  icon: string;
  tip?: string;
}[] = [
  { type: "HARMONIC", label: "HARM", icon: "◎", tip: "Smooth harmonic peaks" },
  { type: "NOISE", label: "NOIS", icon: "▒", tip: "Broadband noise energy" },
  { type: "GRADIENT", label: "GRAD", icon: "◑", tip: "Amplitude slope" },
  { type: "FORMANT", label: "FORM", icon: "⊕", tip: "Vowel formant clusters" },
  { type: "METAL", label: "METL", icon: "⋆", tip: "Inharmonic overtones" },
  { type: "LINE", label: "LINE", icon: "─", tip: "Hold note — sustained line" },
  { type: "PLUCK", label: "PLUK", icon: "↑", tip: "Short pluck spike" },
  {
    type: "SCATTER",
    label: "SCAT",
    icon: "·:·",
    tip: "Random spray of plucks",
  },
  { type: "COMB", label: "COMB", icon: "|||", tip: "Comb filter bands" },
  { type: "ERASE", label: "ERAS", icon: "✕", tip: "Erase energy" },
  { type: "SMOOTH", label: "SMTH", icon: "≈", tip: "Smooth neighboring bins" },
  { type: "RANDOM", label: "RAND", icon: "⁂", tip: "Random harmonics" },
  {
    type: "MIRROR",
    label: "MIRR",
    icon: "⇔",
    tip: "Mirror to upper harmonics",
  },
  { type: "STACK", label: "STCK", icon: "⊞", tip: "Harmonic ladder" },
  {
    type: "COLOR_PICKER",
    label: "PICK",
    icon: "⊙",
    tip: "Sample existing color",
  },
  { type: "FILL", label: "FILL", icon: "▣", tip: "Fill region" },
];

export default function BrushPanel({ brush, onChange }: BrushPanelProps) {
  return (
    <div data-ocid="brush.panel" className="flex flex-col gap-2 p-2">
      <div className="text-[10px] font-mono text-synth-dim tracking-widest uppercase">
        Brush
      </div>
      <div className="grid grid-cols-4 gap-1">
        {BRUSHES.map(({ type, label, icon, tip }) => (
          <button
            type="button"
            key={type}
            onClick={() => onChange({ type })}
            className={`flex flex-col items-center justify-center py-1.5 rounded text-[10px] font-mono transition-all border ${
              brush.type === type
                ? "bg-primary/20 border-primary/50 text-primary shadow-glow-sm"
                : "border-synth-border text-synth-dim hover:border-synth-border hover:text-muted-foreground"
            }`}
            title={tip ?? type}
          >
            <span className="text-sm leading-none mb-0.5">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] font-mono text-synth-dim whitespace-nowrap">
          SIZE
        </span>
        <input
          type="range"
          aria-label="Brush size"
          className="synth-slider flex-1"
          min={1}
          max={8}
          step={1}
          value={brush.size}
          onChange={(e) => onChange({ size: Number(e.target.value) })}
          style={
            {
              "--progress": `${((brush.size - 1) / 7) * 100}%`,
            } as React.CSSProperties
          }
        />
        <span className="text-[10px] font-mono text-muted-foreground w-3">
          {brush.size}
        </span>
      </div>
    </div>
  );
}

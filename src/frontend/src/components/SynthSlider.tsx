import { useId } from "react";

interface SynthSliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  displayValue?: string;
  accent?: string;
  dataOcid?: string;
}

export default function SynthSlider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  displayValue,
  accent,
  dataOcid,
}: SynthSliderProps) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  const display =
    displayValue ?? (step >= 1 ? String(Math.round(value)) : value.toFixed(2));

  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <label
        htmlFor={id}
        className="text-[10px] font-mono text-synth-dim w-20 flex-shrink-0 truncate"
      >
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="synth-slider flex-1 min-w-0"
        min={min}
        max={max}
        step={step}
        value={value}
        data-ocid={dataOcid}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            "--progress": `${pct}%`,
            "--synth-slider-thumb": accent ? "var(--synth-glow)" : undefined,
          } as React.CSSProperties
        }
      />
      <span className="text-[10px] font-mono text-muted-foreground w-7 text-right flex-shrink-0">
        {display}
      </span>
    </div>
  );
}

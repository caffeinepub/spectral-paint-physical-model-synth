import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SynthParams } from "../types";
import SynthSlider from "./SynthSlider";

const FILTER_TYPES: SynthParams["filterType"][] = [
  "Lowpass",
  "Bandpass",
  "Highpass",
];

interface Props {
  params: SynthParams;
  onChange: (u: Partial<SynthParams>) => void;
}

export default function FilterPanel({ params, onChange }: Props) {
  return (
    <div className="p-2 space-y-1.5">
      <div>
        <span className="text-[10px] font-mono text-synth-dim block mb-1">
          TYPE
        </span>
        <Select
          value={params.filterType}
          onValueChange={(v) =>
            onChange({ filterType: v as SynthParams["filterType"] })
          }
        >
          <SelectTrigger className="h-6 text-[10px] font-mono border-synth-border bg-transparent w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-synth-panel border-synth-border font-mono text-[10px]">
            {FILTER_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-[10px]">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SynthSlider
        label="CUTOFF"
        value={params.filterCutoff}
        onChange={(v) => onChange({ filterCutoff: v })}
        displayValue={`${Math.round(20 * 1000 ** params.filterCutoff)}Hz`}
      />
      <SynthSlider
        label="RESONANCE"
        value={params.filterResonance}
        onChange={(v) => onChange({ filterResonance: v })}
      />
      <SynthSlider
        label="DRIVE"
        value={params.filterDrive}
        onChange={(v) => onChange({ filterDrive: v })}
      />
    </div>
  );
}

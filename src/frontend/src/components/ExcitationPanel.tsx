import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SynthParams } from "../types";
import SynthSlider from "./SynthSlider";

const SOURCES: SynthParams["excitationSource"][] = [
  "SpectralHarmonics",
  "NoiseBurst",
  "OscillatorStack",
  "AirFlow",
  "PulseStrike",
];

interface Props {
  params: SynthParams;
  onChange: (u: Partial<SynthParams>) => void;
}

export default function ExcitationPanel({ params, onChange }: Props) {
  return (
    <div className="p-2 space-y-1.5">
      <div>
        <span className="text-[10px] font-mono text-synth-dim block mb-1">
          SOURCE
        </span>
        <Select
          value={params.excitationSource}
          onValueChange={(v) =>
            onChange({ excitationSource: v as SynthParams["excitationSource"] })
          }
        >
          <SelectTrigger className="h-6 text-[10px] font-mono border-synth-border bg-transparent w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-synth-panel border-synth-border font-mono text-[10px]">
            {SOURCES.map((s) => (
              <SelectItem key={s} value={s} className="text-[10px]">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SynthSlider
        label="ATK SHARP"
        value={params.attackSharpness}
        onChange={(v) => onChange({ attackSharpness: v })}
      />
      <SynthSlider
        label="NOISE MIX"
        value={params.noiseMix}
        onChange={(v) => onChange({ noiseMix: v })}
      />
      <SynthSlider
        label="OSC MIX"
        value={params.oscMix}
        onChange={(v) => onChange({ oscMix: v })}
      />
      <SynthSlider
        label="ENERGY"
        value={params.excitationEnergy}
        onChange={(v) => onChange({ excitationEnergy: v })}
      />
    </div>
  );
}

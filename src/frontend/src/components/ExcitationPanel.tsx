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
      <SynthSlider
        label="ENERGY THRESH"
        value={params.energyThreshold}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onChange({ energyThreshold: v })}
      />
      <SynthSlider
        label="AMP GAIN"
        value={params.amplitudeGain}
        min={0}
        max={3}
        step={0.05}
        onChange={(v) => onChange({ amplitudeGain: v })}
      />
      <SynthSlider
        label="AMP FLOOR"
        value={params.amplitudeFloor}
        min={0}
        max={0.5}
        step={0.01}
        onChange={(v) => onChange({ amplitudeFloor: v })}
      />
      <SynthSlider
        label="IMPULSE WIDTH"
        value={params.impulseWidth}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onChange({ impulseWidth: v })}
      />
    </div>
  );
}

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SynthParams } from "../types";
import SynthSlider from "./SynthSlider";

const RESONATOR_TYPES: SynthParams["resonatorType"][] = [
  "String",
  "BowedString",
  "TubeAirColumn",
  "MetalPlate",
  "DrumMembrane",
  "HybridMorph",
];

interface Props {
  params: SynthParams;
  onChange: (u: Partial<SynthParams>) => void;
}

export default function ResonatorPanel({ params, onChange }: Props) {
  return (
    <div data-ocid="resonator.panel" className="p-2 space-y-1.5">
      <div>
        <span className="text-[10px] font-mono text-synth-dim block mb-1">
          TYPE
        </span>
        <Select
          value={params.resonatorType}
          onValueChange={(v) =>
            onChange({ resonatorType: v as SynthParams["resonatorType"] })
          }
        >
          <SelectTrigger className="h-6 text-[10px] font-mono border-synth-border bg-transparent w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-synth-panel border-synth-border font-mono text-[10px]">
            {RESONATOR_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-[10px]">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SynthSlider
        label="TENSION"
        value={params.tension}
        onChange={(v) => onChange({ tension: v })}
      />
      <SynthSlider
        label="DAMPING"
        value={params.damping}
        onChange={(v) => onChange({ damping: v })}
      />
      <SynthSlider
        label="RESONANCE"
        value={params.resonance}
        onChange={(v) => onChange({ resonance: v })}
      />
      <SynthSlider
        label="DECAY TIME"
        value={params.decayTime}
        onChange={(v) => onChange({ decayTime: v })}
      />
      <SynthSlider
        label="BRIGHTNESS"
        value={params.brightness}
        onChange={(v) => onChange({ brightness: v })}
      />
      <SynthSlider
        label="SUSTAIN NRG"
        value={params.sustainEnergy}
        onChange={(v) => onChange({ sustainEnergy: v })}
      />
      <SynthSlider
        label="MORPH"
        value={params.resonatorMorph}
        onChange={(v) => onChange({ resonatorMorph: v })}
      />
      <SynthSlider
        label="PICKUP POS"
        value={params.pickupPosition}
        onChange={(v) => onChange({ pickupPosition: v })}
      />
    </div>
  );
}

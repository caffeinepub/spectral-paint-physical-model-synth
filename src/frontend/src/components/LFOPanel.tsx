import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SynthParams } from "../types";
import SynthSlider from "./SynthSlider";

const LFO_WAVES: SynthParams["lfoWave"][] = [
  "Sine",
  "Triangle",
  "Square",
  "Random",
];
const LFO_TARGETS: SynthParams["lfoTarget"][] = [
  "Pitch",
  "ResonatorTension",
  "FilterCutoff",
  "SpectralTilt",
  "BodyMix",
];

interface Props {
  params: SynthParams;
  onChange: (u: Partial<SynthParams>) => void;
}

export default function LFOPanel({ params, onChange }: Props) {
  return (
    <div className="p-2 space-y-1.5">
      <div className="grid grid-cols-2 gap-1">
        <div>
          <span className="text-[10px] font-mono text-synth-dim block mb-1">
            WAVE
          </span>
          <Select
            value={params.lfoWave}
            onValueChange={(v) =>
              onChange({ lfoWave: v as SynthParams["lfoWave"] })
            }
          >
            <SelectTrigger className="h-6 text-[10px] font-mono border-synth-border bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-synth-panel border-synth-border font-mono text-[10px]">
              {LFO_WAVES.map((t) => (
                <SelectItem key={t} value={t} className="text-[10px]">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <span className="text-[10px] font-mono text-synth-dim block mb-1">
            TARGET
          </span>
          <Select
            value={params.lfoTarget}
            onValueChange={(v) =>
              onChange({ lfoTarget: v as SynthParams["lfoTarget"] })
            }
          >
            <SelectTrigger className="h-6 text-[10px] font-mono border-synth-border bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-synth-panel border-synth-border font-mono text-[10px]">
              {LFO_TARGETS.map((t) => (
                <SelectItem key={t} value={t} className="text-[10px]">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <SynthSlider
        label="RATE"
        value={params.lfoRate}
        onChange={(v) => onChange({ lfoRate: v })}
        displayValue={`${(params.lfoRate * 20).toFixed(2)}Hz`}
      />
      <SynthSlider
        label="DEPTH"
        value={params.lfoDepth}
        onChange={(v) => onChange({ lfoDepth: v })}
      />
    </div>
  );
}

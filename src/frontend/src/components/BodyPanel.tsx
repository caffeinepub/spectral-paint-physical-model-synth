import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SynthParams } from "../types";
import SynthSlider from "./SynthSlider";

const BODY_MODELS: SynthParams["bodyModel"][] = [
  "None",
  "GuitarBody",
  "ViolinBody",
  "PianoSoundboard",
  "WoodBox",
  "MetalChamber",
];

interface Props {
  params: SynthParams;
  onChange: (u: Partial<SynthParams>) => void;
}

export default function BodyPanel({ params, onChange }: Props) {
  return (
    <div className="p-2 space-y-1.5">
      <div>
        <span className="text-[10px] font-mono text-synth-dim block mb-1">
          BODY MODEL
        </span>
        <Select
          value={params.bodyModel}
          onValueChange={(v) =>
            onChange({ bodyModel: v as SynthParams["bodyModel"] })
          }
        >
          <SelectTrigger className="h-6 text-[10px] font-mono border-synth-border bg-transparent w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-synth-panel border-synth-border font-mono text-[10px]">
            {BODY_MODELS.map((t) => (
              <SelectItem key={t} value={t} className="text-[10px]">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SynthSlider
        label="BODY SIZE"
        value={params.bodySize}
        onChange={(v) => onChange({ bodySize: v })}
      />
      <SynthSlider
        label="BODY MIX"
        value={params.bodyMix}
        onChange={(v) => onChange({ bodyMix: v })}
      />
    </div>
  );
}

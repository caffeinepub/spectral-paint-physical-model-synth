import type { SynthParams } from "../types";
import SynthSlider from "./SynthSlider";

interface Props {
  params: SynthParams;
  onChange: (u: Partial<SynthParams>) => void;
}

export default function EnvelopePanel({ params, onChange }: Props) {
  return (
    <div className="p-2 space-y-0.5">
      <SynthSlider
        label="ATTACK"
        value={params.attack}
        onChange={(v) => onChange({ attack: v })}
        displayValue={`${(params.attack * 2).toFixed(2)}s`}
      />
      <SynthSlider
        label="DECAY"
        value={params.decay}
        onChange={(v) => onChange({ decay: v })}
        displayValue={`${params.decay.toFixed(2)}s`}
      />
      <SynthSlider
        label="SUSTAIN"
        value={params.sustain}
        onChange={(v) => onChange({ sustain: v })}
      />
      <SynthSlider
        label="RELEASE"
        value={params.release}
        onChange={(v) => onChange({ release: v })}
        displayValue={`${(params.release * 3).toFixed(2)}s`}
      />
    </div>
  );
}

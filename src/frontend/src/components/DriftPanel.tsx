import type { SynthParams } from "../types";
import SynthSlider from "./SynthSlider";

interface Props {
  params: SynthParams;
  onChange: (u: Partial<SynthParams>) => void;
}

export default function DriftPanel({ params, onChange }: Props) {
  return (
    <div className="p-2 space-y-0.5">
      <SynthSlider
        label="DRIFT AMT"
        value={params.driftAmount}
        onChange={(v) => onChange({ driftAmount: v })}
      />
      <SynthSlider
        label="DRIFT RATE"
        value={params.driftRate}
        onChange={(v) => onChange({ driftRate: v })}
      />
    </div>
  );
}

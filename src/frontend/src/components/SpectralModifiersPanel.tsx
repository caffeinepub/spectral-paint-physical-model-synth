import type { SynthParams } from "../types";
import SynthSlider from "./SynthSlider";

interface Props {
  params: SynthParams;
  onChange: (u: Partial<SynthParams>) => void;
}

export default function SpectralModifiersPanel({ params, onChange }: Props) {
  return (
    <div className="p-2 space-y-0.5">
      <SynthSlider
        label="SPECTRAL TILT"
        value={params.spectralTilt}
        min={-1}
        max={1}
        step={0.01}
        onChange={(v) => onChange({ spectralTilt: v })}
      />
      <SynthSlider
        label="HARM SPREAD"
        value={params.harmonicSpread}
        onChange={(v) => onChange({ harmonicSpread: v })}
      />
      <SynthSlider
        label="HARM DENSITY"
        value={params.harmonicDensity}
        onChange={(v) => onChange({ harmonicDensity: v })}
      />
      <SynthSlider
        label="ODD/EVEN"
        value={params.oddEvenBalance}
        onChange={(v) => onChange({ oddEvenBalance: v })}
      />
      <SynthSlider
        label="INHARMONIC"
        value={params.inharmonicity}
        onChange={(v) => onChange({ inharmonicity: v })}
      />
      <SynthSlider
        label="SPEC SMOOTH"
        value={params.spectralSmoothing}
        onChange={(v) => onChange({ spectralSmoothing: v })}
      />
      <SynthSlider
        label="AMP THRESH"
        value={params.amplitudeThreshold}
        min={0}
        max={0.5}
        step={0.005}
        onChange={(v) => onChange({ amplitudeThreshold: v })}
      />
    </div>
  );
}

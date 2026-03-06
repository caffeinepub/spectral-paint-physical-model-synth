import type { SynthParams } from "../types";

interface Props {
  params: SynthParams;
  onChange: (u: Partial<SynthParams>) => void;
}

function EffectRow({
  label,
  enabled,
  mix,
  onToggle,
  onMix,
  ocid,
}: {
  label: string;
  enabled: boolean;
  mix: number;
  onToggle: (v: boolean) => void;
  onMix: (v: number) => void;
  ocid: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <button
        type="button"
        data-ocid={ocid}
        onClick={() => onToggle(!enabled)}
        className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-all w-16 flex-shrink-0 ${
          enabled
            ? "bg-primary/20 border-primary/50 text-primary"
            : "border-synth-border text-synth-dim hover:border-synth-border/80"
        }`}
      >
        {label}
      </button>
      <input
        type="range"
        aria-label={`${label} mix`}
        className="synth-slider flex-1"
        min={0}
        max={1}
        step={0.01}
        value={mix}
        onChange={(e) => onMix(Number(e.target.value))}
        disabled={!enabled}
        style={
          {
            "--progress": `${mix * 100}%`,
            opacity: enabled ? 1 : 0.4,
          } as React.CSSProperties
        }
      />
      <span className="text-[10px] font-mono text-muted-foreground w-6 text-right">
        {Math.round(mix * 100)}
      </span>
    </div>
  );
}

export default function EffectsPanel({ params, onChange }: Props) {
  return (
    <div className="p-2 space-y-0.5">
      <EffectRow
        label="CHORUS"
        enabled={params.chorusEnabled}
        mix={params.chorusMix}
        onToggle={(v) => onChange({ chorusEnabled: v })}
        onMix={(v) => onChange({ chorusMix: v })}
        ocid="effects.chorus_toggle"
      />
      <EffectRow
        label="DELAY"
        enabled={params.delayEnabled}
        mix={params.delayMix}
        onToggle={(v) => onChange({ delayEnabled: v })}
        onMix={(v) => onChange({ delayMix: v })}
        ocid="effects.delay_toggle"
      />
      <EffectRow
        label="REVERB"
        enabled={params.reverbEnabled}
        mix={params.reverbMix}
        onToggle={(v) => onChange({ reverbEnabled: v })}
        onMix={(v) => onChange({ reverbMix: v })}
        ocid="effects.reverb_toggle"
      />
    </div>
  );
}

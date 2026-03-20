import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface CollapsiblePanelProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  accentColor?: string;
  dataOcid?: string;
}

export default function CollapsiblePanel({
  title,
  icon,
  defaultOpen = false,
  children,
  accentColor,
  dataOcid,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      data-ocid={dataOcid}
      className="border-b border-synth-border last:border-b-0"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-synth-panel/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-synth-dim">{icon}</span>}
          <span
            className="text-[10px] font-mono tracking-widest uppercase"
            style={{ color: accentColor ?? undefined }}
          >
            {title}
          </span>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-synth-dim" />
        ) : (
          <ChevronRight className="w-4 h-4 text-synth-dim" />
        )}
      </button>
      {open && (
        <div className="panel-content border-t border-synth-border/30 bg-black/20">
          {children}
        </div>
      )}
    </div>
  );
}

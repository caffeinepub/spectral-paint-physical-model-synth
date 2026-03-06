import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Circle,
  Download,
  FolderOpen,
  Music2,
  Play,
  Save,
  Shuffle,
  Square,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface TopBarProps {
  isPlaying: boolean;
  isRecording: boolean;
  onPlay: () => void;
  onStop: () => void;
  onRecord: () => void;
  onSaveWav: () => void;
  onSaveMp3: () => void;
  onLoadPreset: (name: string) => void;
  onSavePreset: (name: string) => void;
  onRandomPatch: () => void;
  presetNames: string[];
  currentPreset: string | null;
}

export default function TopBar({
  isPlaying,
  isRecording,
  onPlay,
  onStop,
  onRecord,
  onSaveWav,
  onSaveMp3,
  onLoadPreset,
  onSavePreset,
  onRandomPatch,
  presetNames,
  currentPreset,
}: TopBarProps) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [overwriteConfirm, setOverwriteConfirm] = useState(false);

  const handleSaveClick = () => {
    setSaveDialogOpen(true);
    setPresetName(currentPreset ?? "");
    setOverwriteConfirm(false);
  };

  const handleConfirmSave = () => {
    if (!presetName.trim()) {
      toast.error("Enter a preset name");
      return;
    }
    if (presetNames.includes(presetName) && !overwriteConfirm) {
      setOverwriteConfirm(true);
      return;
    }
    onSavePreset(presetName.trim());
    setSaveDialogOpen(false);
    setOverwriteConfirm(false);
    toast.success(`Preset "${presetName}" saved`);
  };

  return (
    <header className="flex items-center gap-1 px-2 py-1.5 border-b border-synth-border bg-background/95 backdrop-blur-sm flex-wrap">
      {/* Title */}
      <div className="flex items-center gap-1 mr-2 min-w-0">
        <Music2 className="w-3.5 h-3.5 text-synth-glow flex-shrink-0" />
        <span className="font-mono text-[10px] font-bold text-synth-glow tracking-widest spectral-glow truncate hidden sm:block">
          SPECTRAL PAINT
        </span>
      </div>

      {/* Transport */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-ocid="topbar.play_button"
          onClick={onPlay}
          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border transition-all touch-target ${
            isPlaying
              ? "synth-btn-active border-primary/60 text-primary"
              : "border-synth-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
          }`}
          title="Play"
        >
          <Play className="w-3 h-3" />
          <span className="hidden sm:inline">PLAY</span>
        </button>

        <button
          type="button"
          data-ocid="topbar.stop_button"
          onClick={onStop}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border border-synth-border text-muted-foreground hover:border-destructive/40 hover:text-destructive transition-all touch-target"
          title="Stop"
        >
          <Square className="w-3 h-3" />
          <span className="hidden sm:inline">STOP</span>
        </button>

        <button
          type="button"
          data-ocid="topbar.record_button"
          onClick={onRecord}
          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border transition-all touch-target ${
            isRecording
              ? "synth-btn-recording border-destructive/60 text-destructive"
              : "border-synth-border text-muted-foreground hover:border-destructive/40 hover:text-destructive"
          }`}
          title="Record"
        >
          <Circle
            className={`w-3 h-3 ${isRecording ? "fill-destructive" : ""}`}
          />
          <span className="hidden sm:inline">REC</span>
        </button>
      </div>

      <div className="w-px h-4 bg-synth-border mx-0.5" />

      {/* Export */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-ocid="topbar.save_wav_button"
          onClick={onSaveWav}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border border-synth-border text-muted-foreground hover:border-synth-warm/40 hover:text-synth-warm transition-all touch-target"
          title="Export WAV"
        >
          <Download className="w-3 h-3" />
          <span className="hidden sm:inline">WAV</span>
        </button>

        <button
          type="button"
          data-ocid="topbar.save_mp3_button"
          onClick={onSaveMp3}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border border-synth-border text-muted-foreground hover:border-synth-warm/40 hover:text-synth-warm transition-all touch-target"
          title="Export MP3/WebM"
        >
          <Download className="w-3 h-3" />
          <span className="hidden sm:inline">MP3</span>
        </button>
      </div>

      <div className="w-px h-4 bg-synth-border mx-0.5" />

      {/* Presets */}
      <div className="flex items-center gap-1">
        <Select onValueChange={onLoadPreset} value={currentPreset ?? ""}>
          <SelectTrigger
            data-ocid="preset.load_select"
            className="h-7 text-[11px] font-mono w-[100px] sm:w-[140px] border-synth-border bg-synth-panel text-muted-foreground"
          >
            <FolderOpen className="w-3 h-3 mr-1 flex-shrink-0" />
            <SelectValue placeholder="PRESET" />
          </SelectTrigger>
          <SelectContent className="bg-synth-panel border-synth-border font-mono text-[11px]">
            {presetNames.map((name) => (
              <SelectItem key={name} value={name} className="text-[11px]">
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          data-ocid="topbar.load_preset_button"
          onClick={() => currentPreset && onLoadPreset(currentPreset)}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border border-synth-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all touch-target"
          title="Load preset"
        >
          <Upload className="w-3 h-3" />
        </button>

        <button
          type="button"
          data-ocid="topbar.save_preset_button"
          onClick={handleSaveClick}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border border-synth-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all touch-target"
          title="Save preset"
        >
          <Save className="w-3 h-3" />
        </button>

        <button
          type="button"
          data-ocid="topbar.random_patch_button"
          onClick={onRandomPatch}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded border border-synth-border text-muted-foreground hover:border-accent/40 hover:text-accent transition-all touch-target"
          title="Random patch"
        >
          <Shuffle className="w-3 h-3" />
          <span className="hidden sm:inline">RND</span>
        </button>
      </div>

      {/* Save Preset Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent
          data-ocid="preset.dialog"
          className="bg-synth-panel border-synth-border font-mono max-w-sm"
        >
          <DialogHeader>
            <DialogTitle className="text-sm text-foreground">
              {overwriteConfirm ? "Overwrite Preset?" : "Save Preset"}
            </DialogTitle>
          </DialogHeader>
          {overwriteConfirm ? (
            <p className="text-xs text-muted-foreground">
              Preset "{presetName}" already exists. Overwrite?
            </p>
          ) : (
            <Input
              data-ocid="preset.save_input"
              value={presetName}
              onChange={(e) => {
                setPresetName(e.target.value);
                setOverwriteConfirm(false);
              }}
              placeholder="Preset name..."
              className="text-xs bg-input border-synth-border font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleConfirmSave()}
            />
          )}
          <DialogFooter className="gap-2">
            <Button
              data-ocid="preset.cancel_button"
              variant="ghost"
              size="sm"
              className="text-xs font-mono"
              onClick={() => {
                setSaveDialogOpen(false);
                setOverwriteConfirm(false);
              }}
            >
              Cancel
            </Button>
            <Button
              data-ocid="preset.confirm_button"
              size="sm"
              className="text-xs font-mono bg-primary/20 border border-primary/40 hover:bg-primary/30 text-primary"
              onClick={handleConfirmSave}
            >
              {overwriteConfirm ? "Overwrite" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}

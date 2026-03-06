import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { SynthParams } from "../types";
import SynthSlider from "./SynthSlider";

const CHORD_TYPES = [
  "Major",
  "Minor",
  "Diminished",
  "Augmented",
  "Sus2",
  "Sus4",
  "Major7",
  "Minor7",
  "Dominant7",
  "MinorMajor7",
  "Add9",
  "MinorAdd9",
  "Major9",
  "Minor9",
  "PowerChord",
  "OctaveStack",
  "FifthStack",
  "HarmonicCluster",
  "RandomChord",
];

const INVERSIONS = ["Root", "First", "Second", "Third", "Spread Voicing"];

const SCALE_LOCKS = [
  "Chromatic",
  "Major",
  "NaturalMinor",
  "HarmonicMinor",
  "Dorian",
  "Mixolydian",
  "Phrygian",
  "Lydian",
  "PentatonicMajor",
  "PentatonicMinor",
  "WholeTone",
];

const ROOT_NOTES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const PROGRESSIONS = [
  "I IV V",
  "I V vi IV",
  "ii V I",
  "I vi IV V",
  "Minor i VII VI VII",
  "Ambient Drone Cycle",
  "Random Progression",
];

interface ChordPanelProps {
  params: SynthParams;
  onChange: (updates: Partial<SynthParams>) => void;
}

export default function ChordPanel({ params, onChange }: ChordPanelProps) {
  return (
    <div data-ocid="chord.panel" className="p-2 space-y-2">
      {/* Chord Mode Toggle */}
      <div className="flex items-center justify-between py-1">
        <span className="text-[11px] font-mono text-foreground">
          CHORD MODE
        </span>
        <Switch
          data-ocid="chord.mode_toggle"
          checked={params.chordMode}
          onCheckedChange={(v) => onChange({ chordMode: v })}
          className="scale-75"
        />
      </div>

      {/* Chord Type + Inversion */}
      <div className="grid grid-cols-2 gap-1">
        <div>
          <span className="text-[10px] font-mono text-synth-dim block mb-1">
            TYPE
          </span>
          <Select
            value={params.chordType}
            onValueChange={(v) => onChange({ chordType: v })}
          >
            <SelectTrigger className="h-6 text-[10px] font-mono border-synth-border bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-synth-panel border-synth-border font-mono text-[10px] max-h-48">
              {CHORD_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="text-[10px]">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <span className="text-[10px] font-mono text-synth-dim block mb-1">
            INVERSION
          </span>
          <Select
            value={params.chordInversion}
            onValueChange={(v) => onChange({ chordInversion: v })}
          >
            <SelectTrigger className="h-6 text-[10px] font-mono border-synth-border bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-synth-panel border-synth-border font-mono text-[10px]">
              {INVERSIONS.map((t) => (
                <SelectItem key={t} value={t} className="text-[10px]">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <SynthSlider
        label="SPREAD (oct)"
        value={params.chordSpread}
        min={0}
        max={3}
        step={0.1}
        onChange={(v) => onChange({ chordSpread: v })}
      />
      <SynthSlider
        label="CHORD SIZE"
        value={params.chordSize}
        min={2}
        max={6}
        step={1}
        onChange={(v) => onChange({ chordSize: v })}
        displayValue={String(params.chordSize)}
      />

      {/* Strum Mode */}
      <div className="flex items-center justify-between py-1">
        <span className="text-[10px] font-mono text-synth-dim">STRUM MODE</span>
        <Switch
          checked={params.strumMode}
          onCheckedChange={(v) => onChange({ strumMode: v })}
          className="scale-75"
        />
      </div>
      {params.strumMode && (
        <SynthSlider
          label="STRUM SPEED"
          value={params.strumSpeed}
          min={0}
          max={200}
          step={5}
          onChange={(v) => onChange({ strumSpeed: v })}
          displayValue={`${params.strumSpeed}ms`}
        />
      )}

      <SynthSlider
        label="DETUNE (¢)"
        value={params.chordDetune}
        min={0}
        max={10}
        step={0.1}
        onChange={(v) => onChange({ chordDetune: v })}
      />
      <SynthSlider
        label="PAN SPREAD"
        value={params.panSpread}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onChange({ panSpread: v })}
      />

      {/* Scale Lock + Root */}
      <div className="grid grid-cols-2 gap-1">
        <div>
          <span className="text-[10px] font-mono text-synth-dim block mb-1">
            SCALE
          </span>
          <Select
            value={params.scaleLock}
            onValueChange={(v) => onChange({ scaleLock: v })}
          >
            <SelectTrigger className="h-6 text-[10px] font-mono border-synth-border bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-synth-panel border-synth-border font-mono text-[10px] max-h-48">
              {SCALE_LOCKS.map((t) => (
                <SelectItem key={t} value={t} className="text-[10px]">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <span className="text-[10px] font-mono text-synth-dim block mb-1">
            ROOT
          </span>
          <Select
            value={params.rootNote}
            onValueChange={(v) => onChange({ rootNote: v })}
          >
            <SelectTrigger className="h-6 text-[10px] font-mono border-synth-border bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-synth-panel border-synth-border font-mono text-[10px]">
              {ROOT_NOTES.map((t) => (
                <SelectItem key={t} value={t} className="text-[10px]">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Progression Mode */}
      <div className="flex items-center justify-between py-1">
        <span className="text-[10px] font-mono text-synth-dim">
          PROGRESSION
        </span>
        <Switch
          checked={params.progressionMode}
          onCheckedChange={(v) => onChange({ progressionMode: v })}
          className="scale-75"
        />
      </div>
      {params.progressionMode && (
        <>
          <Select
            value={params.progressionSelector}
            onValueChange={(v) => onChange({ progressionSelector: v })}
          >
            <SelectTrigger className="h-6 text-[10px] font-mono border-synth-border bg-transparent w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-synth-panel border-synth-border font-mono text-[10px]">
              {PROGRESSIONS.map((t) => (
                <SelectItem key={t} value={t} className="text-[10px]">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SynthSlider
            label="PROG SPEED"
            value={params.progressionSpeed}
            min={1}
            max={16}
            step={1}
            onChange={(v) => onChange({ progressionSpeed: v })}
            displayValue={`${params.progressionSpeed}b`}
          />
        </>
      )}
    </div>
  );
}

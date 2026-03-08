export interface SynthParams {
  // Spectral Modifiers
  spectralTilt: number; // -1 to 1
  harmonicSpread: number; // 0 to 1
  harmonicDensity: number; // 0 to 1
  oddEvenBalance: number; // 0 to 1
  inharmonicity: number; // 0 to 1
  spectralSmoothing: number; // 0 to 1
  amplitudeThreshold: number; // 0 to 1

  // Excitation
  excitationSource:
    | "SpectralHarmonics"
    | "NoiseBurst"
    | "OscillatorStack"
    | "AirFlow"
    | "PulseStrike";
  attackSharpness: number; // 0 to 1
  noiseMix: number; // 0 to 1
  oscMix: number; // 0 to 1
  excitationEnergy: number; // 0 to 1

  // Column excitation system
  energyThreshold: number; // 0 to 1 — trigger threshold for excitation detection
  amplitudeGain: number; // 0 to 3 — boost excitation amplitude
  amplitudeFloor: number; // 0 to 0.5 — minimum amplitude to prevent silence
  impulseWidth: number; // 0 to 1 — width of excitation impulse
  energyCompressor: number; // 0 to 1 — compress dynamic range of excitation

  // Playback control
  playbackSpeed: number; // 0.1 to 4 — time stretch
  canvasDuration: number; // 1 to 30 seconds — total playback duration
  loopStart: number; // 0 to 1 — loop region start (fraction of canvas width)
  loopEnd: number; // 0 to 1 — loop region end (fraction of canvas width)

  // Debug
  debugMode: boolean;

  // Resonator
  resonatorType:
    | "String"
    | "BowedString"
    | "TubeAirColumn"
    | "MetalPlate"
    | "DrumMembrane"
    | "HybridMorph";
  tension: number; // 0 to 1
  damping: number; // 0 to 1
  resonance: number; // 0 to 1
  decayTime: number; // 0 to 1
  brightness: number; // 0 to 1
  sustainEnergy: number; // 0 to 1
  resonatorMorph: number; // 0 to 1
  pickupPosition: number; // 0 to 1

  // Body
  bodyModel:
    | "None"
    | "GuitarBody"
    | "ViolinBody"
    | "PianoSoundboard"
    | "WoodBox"
    | "MetalChamber";
  bodySize: number; // 0 to 1
  bodyMix: number; // 0 to 1

  // Drift
  driftAmount: number; // 0 to 1
  driftRate: number; // 0 to 1

  // Filter
  filterType: "Lowpass" | "Bandpass" | "Highpass";
  filterCutoff: number; // 0 to 1
  filterResonance: number; // 0 to 1
  filterDrive: number; // 0 to 1

  // ADSR
  attack: number; // 0 to 1
  decay: number; // 0 to 1
  sustain: number; // 0 to 1
  release: number; // 0 to 1

  // LFO
  lfoWave: "Sine" | "Triangle" | "Square" | "Random";
  lfoRate: number; // 0 to 1
  lfoDepth: number; // 0 to 1
  lfoTarget:
    | "Pitch"
    | "ResonatorTension"
    | "FilterCutoff"
    | "SpectralTilt"
    | "BodyMix";

  // Effects
  chorusEnabled: boolean;
  chorusMix: number;
  delayEnabled: boolean;
  delayMix: number;
  reverbEnabled: boolean;
  reverbMix: number;

  // Chord Engine
  chordMode: boolean;
  chordType: string;
  chordInversion: string;
  chordSpread: number; // 0 to 3
  chordSize: number; // 2 to 6
  strumMode: boolean;
  strumSpeed: number; // 0 to 200ms
  chordDetune: number; // 0 to 10 cents
  panSpread: number; // 0 to 1
  scaleLock: string;
  rootNote: string;
  progressionMode: boolean;
  progressionSelector: string;
  progressionSpeed: number; // 1 to 16
}

export type BrushType =
  | "HARMONIC"
  | "NOISE"
  | "GRADIENT"
  | "FORMANT"
  | "METAL"
  | "ERASE"
  | "SMOOTH"
  | "RANDOM"
  | "MIRROR"
  | "STACK"
  | "COLOR_PICKER"
  | "FILL"
  | "LINE"
  | "PLUCK"
  | "SCATTER"
  | "COMB";

export interface BrushState {
  type: BrushType;
  size: number;
  hue: number;
  saturation: number;
  brightness: number;
}

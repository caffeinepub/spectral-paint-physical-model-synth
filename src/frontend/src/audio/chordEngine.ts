export const CHORD_INTERVALS: Record<string, number[]> = {
  Major: [0, 4, 7],
  Minor: [0, 3, 7],
  Diminished: [0, 3, 6],
  Augmented: [0, 4, 8],
  Sus2: [0, 2, 7],
  Sus4: [0, 5, 7],
  Major7: [0, 4, 7, 11],
  Minor7: [0, 3, 7, 10],
  Dominant7: [0, 4, 7, 10],
  MinorMajor7: [0, 3, 7, 11],
  Add9: [0, 4, 7, 14],
  MinorAdd9: [0, 3, 7, 14],
  Major9: [0, 4, 7, 11, 14],
  Minor9: [0, 3, 7, 10, 14],
  PowerChord: [0, 7],
  OctaveStack: [0, 12, 24],
  FifthStack: [0, 7, 19],
  HarmonicCluster: [0, 2, 4, 7, 9],
  RandomChord: [],
};

export const SCALE_INTERVALS: Record<string, number[]> = {
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  Major: [0, 2, 4, 5, 7, 9, 11],
  NaturalMinor: [0, 2, 3, 5, 7, 8, 10],
  HarmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  PentatonicMajor: [0, 2, 4, 7, 9],
  PentatonicMinor: [0, 3, 5, 7, 10],
  WholeTone: [0, 2, 4, 6, 8, 10],
};

export const ROOT_NOTES: Record<string, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

export const PROGRESSION_TYPES: Record<string, number[]> = {
  "I IV V": [0, 5, 7],
  "I V vi IV": [0, 7, 9, 5],
  "ii V I": [2, 7, 0],
  "I vi IV V": [0, 9, 5, 7],
  "Minor i VII VI VII": [0, 10, 8, 10],
  "Ambient Drone Cycle": [0, 2, 5, 0],
  "Random Progression": [],
};

export function quantizeToBin(
  semitoneOffset: number,
  spread: number,
  totalBins: number,
): number {
  const binsPerOctave = totalBins / (spread + 1);
  const binOffset = Math.round((semitoneOffset / 12) * binsPerOctave);
  return Math.max(0, Math.min(totalBins - 1, binOffset));
}

function applyInversion(intervals: number[], inversion: string): number[] {
  if (intervals.length === 0) return intervals;
  const result = [...intervals];
  if (inversion === "First" && result.length > 1) {
    const first = result.shift()!;
    result.push(first + 12);
  } else if (inversion === "Second" && result.length > 2) {
    const first = result.shift()!;
    const second = result.shift()!;
    result.push(first + 12);
    result.push(second + 12);
  } else if (inversion === "Third" && result.length > 3) {
    for (let i = 0; i < 3; i++) {
      const n = result.shift()!;
      result.push(n + 12);
    }
  } else if (inversion === "Spread Voicing" && result.length > 2) {
    return [
      result[0],
      result[result.length - 1],
      result[Math.floor(result.length / 2)] + 12,
    ];
  }
  return result;
}

export function expandChord(
  baseRow: number,
  chordType: string,
  inversion: string,
  spread: number,
  size: number,
  scaleLock: string,
  rootNote: string,
  totalBins: number,
): number[] {
  let intervals =
    chordType === "RandomChord"
      ? Array.from({ length: size }, () => Math.floor(Math.random() * 12))
      : (CHORD_INTERVALS[chordType] ?? CHORD_INTERVALS.Major);

  intervals = intervals.slice(0, size);

  const scale = SCALE_INTERVALS[scaleLock] ?? SCALE_INTERVALS.Chromatic;
  const root = ROOT_NOTES[rootNote] ?? 0;
  intervals = intervals.map((interval) => {
    const target = (interval + root) % 12;
    let nearest = scale[0];
    let minDist = 12;
    for (const deg of scale) {
      const dist = Math.abs((((target - deg) % 12) + 12) % 12);
      const dist2 = 12 - dist;
      const minD = Math.min(dist, dist2);
      if (minD < minDist) {
        minDist = minD;
        nearest = deg;
      }
    }
    return ((nearest - root + 12) % 12) + (interval - (interval % 12));
  });

  intervals = applyInversion(intervals, inversion);

  return intervals.map((interval) => {
    const spreadBins = Math.round((interval / 12) * ((totalBins * spread) / 3));
    return Math.max(0, Math.min(totalBins - 1, baseRow + spreadBins));
  });
}

export function getProgressionChords(
  progression: string,
  _rootNote: string,
  scale: string,
): string[] {
  const prog = PROGRESSION_TYPES[progression];
  if (!prog || prog.length === 0) {
    const chordNames = Object.keys(CHORD_INTERVALS);
    return Array.from(
      { length: 4 },
      () => chordNames[Math.floor(Math.random() * chordNames.length)],
    );
  }
  const scaleDegs = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.Major;
  return prog.map((degree) => {
    const scaleIdx = scaleDegs.indexOf(degree % 12);
    if (scaleIdx >= 0 && scaleIdx < 3) return "Minor";
    return "Major";
  });
}

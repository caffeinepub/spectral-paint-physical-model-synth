import type { BrushType } from "../types";
import { expandChord } from "./chordEngine";

export type BrushFn = (
  ampGrid: Float32Array[],
  hueGrid: Uint8Array[],
  col: number,
  row: number,
  brushSize: number,
  hue: number,
  saturation: number,
  brightness: number,
  cols: number,
  bins: number,
  chordParams?: {
    chordMode: boolean;
    chordType: string;
    chordInversion: string;
    chordSpread: number;
    chordSize: number;
    scaleLock: string;
    rootNote: string;
  },
) => void;

function gaussian(x: number, sigma: number): number {
  return Math.exp(-(x * x) / (2 * sigma * sigma));
}

function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

function drawAt(
  ampGrid: Float32Array[],
  hueGrid: Uint8Array[],
  col: number,
  row: number,
  amp: number,
  hue: number,
  cols: number,
  bins: number,
): void {
  if (col < 0 || col >= cols || row < 0 || row >= bins) return;
  if (!ampGrid[col]) ampGrid[col] = new Float32Array(bins);
  if (!hueGrid[col]) hueGrid[col] = new Uint8Array(bins);
  ampGrid[col][row] = clamp(amp);
  hueGrid[col][row] = Math.round(clamp(hue, 0, 360)) % 360;
}

export const HARMONIC_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  hue,
  _sat,
  brightness,
  cols,
  bins,
) => {
  const sigma = brushSize * 0.5;
  for (let c = col - brushSize; c <= col + brushSize; c++) {
    for (let r = row - brushSize; r <= row + brushSize; r++) {
      const dist = Math.sqrt((c - col) ** 2 + (r - row) ** 2);
      const amp = gaussian(dist, sigma) * brightness;
      if (amp > 0.01) drawAt(ampGrid, hueGrid, c, r, amp, hue, cols, bins);
    }
  }
};

export const NOISE_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  hue,
  _sat,
  brightness,
  cols,
  bins,
) => {
  for (let c = col - brushSize; c <= col + brushSize; c++) {
    for (let r = row - brushSize; r <= row + brushSize; r++) {
      if (Math.random() > 0.6) continue;
      const amp = Math.random() * brightness;
      drawAt(ampGrid, hueGrid, c, r, amp, hue, cols, bins);
    }
  }
};

export const GRADIENT_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  hue,
  _sat,
  brightness,
  cols,
  bins,
) => {
  const radius = brushSize * 1.5;
  for (let c = col - brushSize; c <= col + brushSize; c++) {
    for (let r = row - brushSize; r <= row + brushSize; r++) {
      const dist = Math.sqrt((c - col) ** 2 + (r - row) ** 2);
      const amp = (1 - dist / radius) * brightness;
      if (amp > 0) drawAt(ampGrid, hueGrid, c, r, amp, hue, cols, bins);
    }
  }
};

export const FORMANT_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  hue,
  _sat,
  brightness,
  cols,
  bins,
) => {
  // Vowel formant clusters: F1, F2, F3 relative positions
  const formants = [0, Math.round(bins * 0.12), Math.round(bins * 0.28)];
  for (const fOffset of formants) {
    const fRow = row + fOffset;
    for (let c = col - brushSize; c <= col + brushSize; c++) {
      for (let r = fRow - 2; r <= fRow + 2; r++) {
        const dist = Math.abs(r - fRow);
        const amp = (1 - dist / 3) * brightness * 0.9;
        if (amp > 0) drawAt(ampGrid, hueGrid, c, r, amp, hue, cols, bins);
      }
    }
  }
};

export const METAL_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  hue,
  _sat,
  brightness,
  cols,
  bins,
) => {
  // Inharmonic overtones using irrational ratios
  const ratios = [1, Math.sqrt(2), Math.sqrt(3), Math.sqrt(5), Math.sqrt(7)];
  for (const ratio of ratios) {
    const targetRow = Math.round(row * ratio) % bins;
    for (let c = col - brushSize; c <= col + brushSize; c++) {
      const amp = brightness / ratio;
      drawAt(
        ampGrid,
        hueGrid,
        c,
        targetRow,
        amp,
        (hue + 220) % 360,
        cols,
        bins,
      );
    }
  }
};

export const ERASE_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  _hue,
  _sat,
  _brightness,
  cols,
  bins,
) => {
  for (let c = col - brushSize; c <= col + brushSize; c++) {
    for (let r = row - brushSize; r <= row + brushSize; r++) {
      const dist = Math.sqrt((c - col) ** 2 + (r - row) ** 2);
      if (dist <= brushSize) drawAt(ampGrid, hueGrid, c, r, 0, 0, cols, bins);
    }
  }
};

export const SMOOTH_BRUSH: BrushFn = (
  ampGrid,
  _hueGrid,
  col,
  row,
  brushSize,
  _hue,
  _sat,
  _brightness,
  cols,
  bins,
) => {
  for (let c = col - brushSize; c <= col + brushSize; c++) {
    if (c < 0 || c >= cols) continue;
    for (let r = row - brushSize; r <= row + brushSize; r++) {
      if (r < 0 || r >= bins) continue;
      let sum = 0;
      let count = 0;
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc >= 0 && nc < cols && nr >= 0 && nr < bins) {
            sum += ampGrid[nc]?.[nr] ?? 0;
            count++;
          }
        }
      }
      if (!ampGrid[c]) ampGrid[c] = new Float32Array(bins);
      ampGrid[c][r] = sum / count;
    }
  }
};

export const RANDOM_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  _hue,
  _sat,
  brightness,
  cols,
  bins,
) => {
  for (let c = col - brushSize; c <= col + brushSize; c++) {
    for (let r = row - brushSize; r <= row + brushSize; r++) {
      if (Math.random() > 0.4) continue;
      const amp = Math.random() * brightness;
      const randHue = Math.random() * 360;
      drawAt(ampGrid, hueGrid, c, r, amp, randHue, cols, bins);
    }
  }
};

export const MIRROR_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  hue,
  sat,
  brightness,
  cols,
  bins,
) => {
  // Draw at position and mirror to upper half
  HARMONIC_BRUSH(
    ampGrid,
    hueGrid,
    col,
    row,
    brushSize,
    hue,
    sat,
    brightness,
    cols,
    bins,
  );
  const mirrorRow = bins - 1 - row;
  if (mirrorRow !== row) {
    HARMONIC_BRUSH(
      ampGrid,
      hueGrid,
      col,
      mirrorRow,
      brushSize,
      hue,
      sat,
      brightness,
      cols,
      bins,
    );
  }
};

export const STACK_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  hue,
  _sat,
  brightness,
  cols,
  bins,
) => {
  // Harmonic ladder every N bins above the drawn row
  const step = 4;
  for (let r = row; r < bins; r += step) {
    const decayFactor = 1 - (r - row) / bins;
    for (let c = col - brushSize; c <= col + brushSize; c++) {
      drawAt(ampGrid, hueGrid, c, r, brightness * decayFactor, hue, cols, bins);
    }
  }
};

export const COLOR_PICKER_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  _brushSize,
  _hue,
  _sat,
  _brightness,
  cols,
  bins,
) => {
  // This brush is handled specially in the component - it reads current values
  // No-op here; the component handles the state update
  void ampGrid;
  void hueGrid;
  void col;
  void row;
  void cols;
  void bins;
};

export const FILL_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  hue,
  _sat,
  brightness,
  cols,
  bins,
) => {
  for (let c = col - brushSize * 2; c <= col + brushSize * 2; c++) {
    for (let r = row - brushSize; r <= row + brushSize; r++) {
      drawAt(ampGrid, hueGrid, c, r, brightness, hue, cols, bins);
    }
  }
};

/**
 * LINE brush: draws a sustained horizontal line from left to right at the
 * drawn row. The entire span of columns covered by the drag holds the note
 * (amplitude stays constant across columns) — ideal for sustained tones.
 */
export const LINE_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  hue,
  _sat,
  brightness,
  cols,
  bins,
) => {
  // Draw a thin horizontal streak across a wide column range
  for (let c = col - brushSize * 4; c <= col + brushSize * 4; c++) {
    for (let r = row - 1; r <= row + 1; r++) {
      if (r < 0 || r >= bins) continue;
      const amp = r === row ? brightness : brightness * 0.4;
      drawAt(ampGrid, hueGrid, c, r, amp, hue, cols, bins);
    }
  }
};

/**
 * PLUCK brush: draws a very narrow spike — only 1-2 columns wide —
 * so the column energy rises then immediately drops, producing a single
 * pluck event per stroke rather than a sustained pad.
 */
export const PLUCK_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  hue,
  _sat,
  brightness,
  cols,
  bins,
) => {
  const sigma = Math.max(0.8, brushSize * 0.3);
  // Very narrow in time (columns), normal in frequency (rows)
  for (let c = col - 1; c <= col + 1; c++) {
    const tEnv = Math.exp(-((c - col) ** 2) / (2 * 0.6 * 0.6));
    for (let r = row - brushSize; r <= row + brushSize; r++) {
      const dist = Math.abs(r - row);
      const amp = gaussian(dist, sigma) * brightness * tEnv;
      if (amp > 0.02) drawAt(ampGrid, hueGrid, c, r, amp, hue, cols, bins);
    }
  }
  // Also erase columns around the spike so energy transitions cleanly
  for (let c = col - 4; c < col - 1; c++) {
    if (c < 0 || c >= cols) continue;
    if (!ampGrid[c]) continue;
    for (let r = row - brushSize - 1; r <= row + brushSize + 1; r++) {
      if (r >= 0 && r < bins) ampGrid[c][r] = 0;
    }
  }
  for (let c = col + 2; c <= col + 5; c++) {
    if (c < 0 || c >= cols) continue;
    if (!ampGrid[c]) continue;
    for (let r = row - brushSize - 1; r <= row + brushSize + 1; r++) {
      if (r >= 0 && r < bins) ampGrid[c][r] = 0;
    }
  }
};

/**
 * SCATTER brush: places random dots at various frequencies and times around
 * the draw point — creates a spray of independent pluck events.
 */
export const SCATTER_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  hue,
  _sat,
  brightness,
  cols,
  bins,
) => {
  const count = Math.max(5, brushSize * 6);
  for (let i = 0; i < count; i++) {
    const dc = Math.round((Math.random() * 2 - 1) * brushSize * 3);
    const dr = Math.round((Math.random() * 2 - 1) * brushSize * 2);
    const amp = (0.5 + Math.random() * 0.5) * brightness;
    const hv = (hue + (Math.random() - 0.5) * 40 + 360) % 360;
    drawAt(ampGrid, hueGrid, col + dc, row + dr, amp, hv, cols, bins);
  }
};

/**
 * COMB brush: draws evenly-spaced frequency bands (like a comb filter)
 * creating a distinctive metallic/robotic tone.
 */
export const COMB_BRUSH: BrushFn = (
  ampGrid,
  hueGrid,
  col,
  row,
  brushSize,
  hue,
  _sat,
  brightness,
  cols,
  bins,
) => {
  const spacing = Math.max(3, Math.round(bins / 12));
  for (let r = row % spacing; r < bins; r += spacing) {
    const distFromCenter = Math.abs(r - row);
    const decay = Math.exp(-distFromCenter / (bins * 0.4));
    for (let c = col - brushSize; c <= col + brushSize; c++) {
      const amp = brightness * decay;
      if (amp > 0.02)
        drawAt(ampGrid, hueGrid, c, r, amp, (hue + 30) % 360, cols, bins);
    }
  }
};

export function getBrush(type: BrushType): BrushFn {
  const map: Record<BrushType, BrushFn> = {
    HARMONIC: HARMONIC_BRUSH,
    NOISE: NOISE_BRUSH,
    GRADIENT: GRADIENT_BRUSH,
    FORMANT: FORMANT_BRUSH,
    METAL: METAL_BRUSH,
    ERASE: ERASE_BRUSH,
    SMOOTH: SMOOTH_BRUSH,
    RANDOM: RANDOM_BRUSH,
    MIRROR: MIRROR_BRUSH,
    STACK: STACK_BRUSH,
    COLOR_PICKER: COLOR_PICKER_BRUSH,
    FILL: FILL_BRUSH,
    LINE: LINE_BRUSH,
    PLUCK: PLUCK_BRUSH,
    SCATTER: SCATTER_BRUSH,
    COMB: COMB_BRUSH,
  };
  return map[type] ?? HARMONIC_BRUSH;
}

export function applyChordBrush(
  ampGrid: Float32Array[],
  hueGrid: Uint8Array[],
  col: number,
  baseRow: number,
  brushSize: number,
  hue: number,
  saturation: number,
  brightness: number,
  cols: number,
  bins: number,
  brushFn: BrushFn,
  chordType: string,
  inversion: string,
  spread: number,
  size: number,
  scaleLock: string,
  rootNote: string,
): void {
  const chordRows = expandChord(
    baseRow,
    chordType,
    inversion,
    spread,
    size,
    scaleLock,
    rootNote,
    bins,
  );
  for (const row of chordRows) {
    brushFn(
      ampGrid,
      hueGrid,
      col,
      row,
      brushSize,
      hue,
      saturation,
      brightness,
      cols,
      bins,
    );
  }
}

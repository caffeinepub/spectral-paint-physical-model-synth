import { useCallback, useEffect, useRef, useState } from "react";
import { applyChordBrush, getBrush } from "../audio/brushEngine";
import type { BrushState } from "../types";

export const CANVAS_COLS = 128;
export const CANVAS_BINS = 32;

function hsvToRgb(
  hInput: number,
  s: number,
  v: number,
): [number, number, number] {
  const h = hInput % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

interface SpectralCanvasProps {
  brush: BrushState;
  onColorPick: (hue: number, brightness: number) => void;
  chordParams: {
    chordMode: boolean;
    chordType: string;
    chordInversion: string;
    chordSpread: number;
    chordSize: number;
    scaleLock: string;
    rootNote: string;
  };
  ampGridRef: React.MutableRefObject<Float32Array[]>;
  hueGridRef: React.MutableRefObject<Uint8Array[]>;
  onDraw: () => void;
  playheadPosition?: number;
  excitationFlashes?: { col: number; energy: number; id: number }[];
  debugData?: {
    columnEnergy: number;
    harmonicEnergy: number[];
    resonatorInputLevel: number;
  } | null;
  debugMode?: boolean;
  loopStart?: number;
  loopEnd?: number;
}

export default function SpectralCanvas({
  brush,
  onColorPick,
  chordParams,
  ampGridRef,
  hueGridRef,
  onDraw,
  playheadPosition,
  excitationFlashes,
  debugData,
  debugMode,
  loopStart,
  loopEnd,
}: SpectralCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const overlayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const dirtyRef = useRef(false);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ col: number; row: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [_panOffset, _setPanOffset] = useState(0);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef(1);

  // Refs for overlay rendering (avoid stale closure inside setInterval)
  const playheadRef = useRef(playheadPosition);
  const flashesRef = useRef(excitationFlashes);
  const debugDataRef = useRef(debugData);
  const debugModeRef = useRef(debugMode);
  const loopStartRef = useRef(loopStart);
  const loopEndRef = useRef(loopEnd);

  useEffect(() => {
    playheadRef.current = playheadPosition;
  }, [playheadPosition]);
  useEffect(() => {
    flashesRef.current = excitationFlashes;
  }, [excitationFlashes]);
  useEffect(() => {
    debugDataRef.current = debugData;
  }, [debugData]);
  useEffect(() => {
    debugModeRef.current = debugMode;
  }, [debugMode]);
  useEffect(() => {
    loopStartRef.current = loopStart;
  }, [loopStart]);
  useEffect(() => {
    loopEndRef.current = loopEnd;
  }, [loopEnd]);

  // Initialize grids
  useEffect(() => {
    if (!ampGridRef.current.length) {
      ampGridRef.current = Array.from(
        { length: CANVAS_COLS },
        () => new Float32Array(CANVAS_BINS),
      );
      hueGridRef.current = Array.from(
        { length: CANVAS_COLS },
        () => new Uint8Array(CANVAS_BINS),
      );
    }
  }, [ampGridRef, hueGridRef]);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cellW = W / CANVAS_COLS;
    const cellH = H / CANVAS_BINS;

    // Background
    ctx.fillStyle = "#080810";
    ctx.fillRect(0, 0, W, H);

    // Render spectral data
    const imgData = ctx.createImageData(W, H);
    const data = imgData.data;

    for (let c = 0; c < CANVAS_COLS; c++) {
      const ampCol = ampGridRef.current[c];
      const hueCol = hueGridRef.current[c];
      if (!ampCol) continue;

      const x0 = Math.floor(c * cellW);
      const x1 = Math.ceil((c + 1) * cellW);

      for (let r = 0; r < CANVAS_BINS; r++) {
        const amp = ampCol[r];
        if (amp < 0.005) continue;
        const hue = hueCol?.[r] ?? 180;
        const [rr, gg, bb] = hsvToRgb(hue, 0.85, amp);

        // Flip y (low freq = bottom)
        const binIdx = CANVAS_BINS - 1 - r;
        const y0 = Math.floor(binIdx * cellH);
        const y1 = Math.ceil((binIdx + 1) * cellH);

        for (let y = y0; y < y1 && y < H; y++) {
          for (let x = x0; x < x1 && x < W; x++) {
            const i = (y * W + x) * 4;
            // Additive blending
            data[i] = Math.min(255, data[i] + rr);
            data[i + 1] = Math.min(255, data[i + 1] + gg);
            data[i + 2] = Math.min(255, data[i + 2] + bb);
            data[i + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Grid overlay
    ctx.strokeStyle = "rgba(100,120,200,0.08)";
    ctx.lineWidth = 1;
    // Vertical grid every 16 cols
    for (let c = 0; c < CANVAS_COLS; c += 16) {
      const x = Math.floor(c * cellW);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    // Horizontal grid every 4 bins
    for (let r = 0; r < CANVAS_BINS; r += 4) {
      const y = Math.floor(r * cellH);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Freq labels on y-axis
    ctx.fillStyle = "rgba(100,140,200,0.5)";
    ctx.font = "9px JetBrains Mono, monospace";
    ctx.textAlign = "right";
    const freqLabels = ["8k", "4k", "2k", "1k", "500", "250", "125", "60"];
    for (let i = 0; i < freqLabels.length; i++) {
      const y = Math.floor((i / freqLabels.length) * H) + 10;
      ctx.fillText(freqLabels[i], W - 2, y);
    }

    // Time labels on x-axis
    ctx.textAlign = "left";
    for (let c = 0; c < CANVAS_COLS; c += 32) {
      const x = Math.floor(c * cellW) + 2;
      ctx.fillText(`${c}`, x, H - 2);
    }
  }, [ampGridRef, hueGridRef]);

  const renderOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    const W = overlay.width;
    const H = overlay.height;

    ctx.clearRect(0, 0, W, H);

    // --- Loop range markers ---
    const lStart = loopStartRef.current;
    const lEnd = loopEndRef.current;
    if (lStart !== undefined && lEnd !== undefined && lEnd > lStart) {
      const x0 = lStart * W;
      const x1 = lEnd * W;

      // Fill region
      ctx.fillStyle = "rgba(255,200,0,0.04)";
      ctx.fillRect(x0, 0, x1 - x0, H);

      // Left boundary
      ctx.strokeStyle = "rgba(255,200,0,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0, H);
      ctx.stroke();

      // Right boundary
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, H);
      ctx.stroke();
    }

    // --- Excitation flashes ---
    const flashes = flashesRef.current;
    if (flashes && flashes.length > 0) {
      for (const flash of flashes) {
        const fx = (flash.col / CANVAS_COLS) * W;
        const alpha = Math.min(1, flash.energy) * 0.9;
        const grad = ctx.createLinearGradient(fx, 0, fx, H);
        grad.addColorStop(0, `rgba(255,255,100,${alpha})`);
        grad.addColorStop(0.5, `rgba(255,200,50,${alpha * 0.6})`);
        grad.addColorStop(1, "rgba(255,255,100,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(fx - 1.5, 0, 3, H);
      }
    }

    // --- Playhead line ---
    const ph = playheadRef.current;
    if (ph !== undefined && ph >= 0) {
      const px = ph * W;
      ctx.save();
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#00ff88";
      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
      ctx.stroke();
      ctx.restore();
    }

    // --- Harmonic energy sidebar (debug mode only) ---
    const dData = debugDataRef.current;
    const dMode = debugModeRef.current;

    if (dMode && dData && dData.harmonicEnergy.length > 0) {
      const bins = dData.harmonicEnergy.length;
      const barH = Math.max(1, Math.floor(H / bins));
      const maxE = Math.max(...dData.harmonicEnergy, 0.001);

      for (let i = 0; i < bins; i++) {
        const e = dData.harmonicEnergy[i] / maxE;
        const barW = e * 40;
        const y = (i / bins) * H;
        ctx.fillStyle = "rgba(100,200,255,0.8)";
        ctx.fillRect(W - barW, y, barW, Math.max(1, barH - 1));
      }
    }

    // --- Debug overlay (bottom-left) ---
    if (dMode && dData) {
      const boxX = 4;
      const boxY = H - 40;
      const boxW = 90;
      const boxH = 36;

      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(boxX, boxY, boxW, boxH);

      // Column energy bar
      const barW = Math.min(
        60,
        (dData.columnEnergy / Math.max(dData.columnEnergy, 1)) * 60,
      );
      ctx.fillStyle = "#00ff88";
      ctx.fillRect(boxX + 2, boxY + 2, barW, 4);

      ctx.fillStyle = "rgba(200,255,200,0.9)";
      ctx.font = "8px monospace";
      ctx.textAlign = "left";
      ctx.fillText(
        `COL E: ${dData.columnEnergy.toFixed(3)}`,
        boxX + 2,
        boxY + 18,
      );
      ctx.fillText(
        `RES IN: ${dData.resonatorInputLevel.toFixed(3)}`,
        boxX + 2,
        boxY + 30,
      );
    }
  }, []);

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      if (dirtyRef.current) {
        renderCanvas();
        dirtyRef.current = false;
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [renderCanvas]);

  // Overlay render at ~30fps via setInterval
  useEffect(() => {
    overlayIntervalRef.current = setInterval(renderOverlay, 33);
    return () => {
      if (overlayIntervalRef.current !== null) {
        clearInterval(overlayIntervalRef.current);
        overlayIntervalRef.current = null;
      }
    };
  }, [renderOverlay]);

  // Initial render
  useEffect(() => {
    dirtyRef.current = true;
  }, []);

  const getGridPos = useCallback(
    (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const col = Math.floor((x / rect.width) * CANVAS_COLS);
      const binY = Math.floor((y / rect.height) * CANVAS_BINS);
      const row = CANVAS_BINS - 1 - binY; // flip y
      return {
        col: Math.max(0, Math.min(CANVAS_COLS - 1, col)),
        row: Math.max(0, Math.min(CANVAS_BINS - 1, row)),
      };
    },
    [],
  );

  const applyBrush = useCallback(
    (col: number, row: number) => {
      const fn = getBrush(brush.type);

      if (brush.type === "COLOR_PICKER") {
        const amp = ampGridRef.current[col]?.[row] ?? 0;
        const hue = hueGridRef.current[col]?.[row] ?? 0;
        onColorPick(hue, amp);
        return;
      }

      if (
        chordParams.chordMode &&
        brush.type !== "ERASE" &&
        brush.type !== "SMOOTH"
      ) {
        applyChordBrush(
          ampGridRef.current,
          hueGridRef.current,
          col,
          row,
          brush.size,
          brush.hue,
          brush.saturation,
          brush.brightness,
          CANVAS_COLS,
          CANVAS_BINS,
          fn,
          chordParams.chordType,
          chordParams.chordInversion,
          chordParams.chordSpread,
          chordParams.chordSize,
          chordParams.scaleLock,
          chordParams.rootNote,
        );
      } else {
        fn(
          ampGridRef.current,
          hueGridRef.current,
          col,
          row,
          brush.size,
          brush.hue,
          brush.saturation,
          brush.brightness,
          CANVAS_COLS,
          CANVAS_BINS,
        );
      }

      dirtyRef.current = true;
      onDraw();
    },
    [brush, chordParams, ampGridRef, hueGridRef, onColorPick, onDraw],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
        pinchStartZoomRef.current = zoom;
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      isDrawingRef.current = true;
      const pos = getGridPos(
        e.touches[0].clientX,
        e.touches[0].clientY,
        canvas,
      );
      lastPosRef.current = pos;
      applyBrush(pos.col, pos.row);
    },
    [zoom, getGridPos, applyBrush],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      // Pinch zoom
      if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const newZoom = Math.max(
          0.5,
          Math.min(
            4,
            pinchStartZoomRef.current * (dist / pinchStartDistRef.current),
          ),
        );
        setZoom(newZoom);
        return;
      }
      if (!isDrawingRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = getGridPos(
        e.touches[0].clientX,
        e.touches[0].clientY,
        canvas,
      );

      // Interpolate between last and current position
      if (lastPosRef.current) {
        const dx = pos.col - lastPosRef.current.col;
        const dy = pos.row - lastPosRef.current.row;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        for (let i = 0; i <= steps; i++) {
          const t = steps > 0 ? i / steps : 0;
          const ic = Math.round(lastPosRef.current.col + dx * t);
          const ir = Math.round(lastPosRef.current.row + dy * t);
          applyBrush(ic, ir);
        }
      }
      lastPosRef.current = pos;
    },
    [getGridPos, applyBrush],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      isDrawingRef.current = false;
      lastPosRef.current = null;
      pinchStartDistRef.current = null;
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      isDrawingRef.current = true;
      const pos = getGridPos(e.clientX, e.clientY, canvas);
      lastPosRef.current = pos;
      applyBrush(pos.col, pos.row);
    },
    [getGridPos, applyBrush],
  );

  // Global mouse handlers so dragging outside canvas still works
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDrawingRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = getGridPos(e.clientX, e.clientY, canvas);
      if (lastPosRef.current) {
        const dx = pos.col - lastPosRef.current.col;
        const dy = pos.row - lastPosRef.current.row;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        for (let i = 0; i <= steps; i++) {
          const t = steps > 0 ? i / steps : 0;
          const ic = Math.round(lastPosRef.current.col + dx * t);
          const ir = Math.round(lastPosRef.current.row + dy * t);
          applyBrush(ic, ir);
        }
      }
      lastPosRef.current = pos;
    };
    const onMouseUp = () => {
      isDrawingRef.current = false;
      lastPosRef.current = null;
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [getGridPos, applyBrush]);

  return (
    <div className="relative w-full spectral-canvas-container scanlines">
      <canvas
        ref={canvasRef}
        width={CANVAS_COLS * 4}
        height={CANVAS_BINS * 8}
        data-ocid="canvas.canvas_target"
        className="w-full h-full block"
        style={{
          imageRendering: "pixelated",
          cursor:
            brush.type === "ERASE"
              ? "cell"
              : brush.type === "COLOR_PICKER"
                ? "crosshair"
                : "crosshair",
          transform: `scaleX(${zoom})`,
          transformOrigin: "left",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      />
      <canvas
        ref={overlayRef}
        width={CANVAS_COLS * 4}
        height={CANVAS_BINS * 8}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ imageRendering: "pixelated" }}
      />
      {zoom !== 1 && (
        <div className="absolute top-1 right-1 text-xs font-mono text-synth-dim bg-black/60 px-1 rounded">
          {zoom.toFixed(1)}×
        </div>
      )}
    </div>
  );
}

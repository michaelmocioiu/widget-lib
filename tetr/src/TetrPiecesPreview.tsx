import { useEffect, useMemo, useRef } from "react";
import type { PieceType } from "./types";
import { PIECE_SHAPES, type PieceStyle } from "./pieces";
import { buildRoundedShapePath, computeShapeOutline, paintStyledShape } from "./outline";

interface PiecesPreviewProps {
  types: PieceType[];
  pieceStyle: PieceStyle;
  colors: Record<string, string>;
  cellSize?: number;
  gap?: number;
  bg?: string;
  className?: string;
}

interface SlotLayout {
  type: PieceType;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Shared by the settings screen's per-style swatch (one piece) and the
// piece-design preview row (all seven) -- both draw with the exact same
// paintStyledShape used by real gameplay, so what's previewed here is
// actually what the board looks like (no separate CSS approximation).
export function TetrPiecesPreview({
  types,
  pieceStyle,
  colors,
  cellSize = 14,
  gap = 8,
  bg = "#14151a",
  className,
}: PiecesPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { layout, width, height } = useMemo(() => {
    let x = 0;
    let maxH = 0;
    const slots: SlotLayout[] = [];
    for (const type of types) {
      const cells = PIECE_SHAPES[type][0];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [cx, cy] of cells) {
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx + 1);
        maxY = Math.max(maxY, cy + 1);
      }
      const w = (maxX - minX) * cellSize;
      const h = (maxY - minY) * cellSize;
      slots.push({ type, x, y: 0, w, h });
      maxH = Math.max(maxH, h);
      x += w + gap;
    }
    const totalW = Math.max(0, x - gap);
    for (const slot of slots) slot.y = (maxH - slot.h) / 2;
    return { layout: slots, width: totalW, height: maxH };
  }, [types, cellSize, gap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const radius = pieceStyle.radiusFactor < 0.1
      ? Math.max(0.5, cellSize * pieceStyle.radiusFactor)
      : Math.max(2, cellSize * pieceStyle.radiusFactor);

    for (const slot of layout) {
      const cells = PIECE_SHAPES[slot.type][0];
      let minX = Infinity, minY = Infinity;
      for (const [cx, cy] of cells) {
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
      }
      const originX = slot.x - minX * cellSize;
      const originY = slot.y - minY * cellSize;
      const outline = computeShapeOutline(cells);
      const path = buildRoundedShapePath(outline, originX, originY, cellSize, radius);
      const color = colors[slot.type] || "#888";
      paintStyledShape(ctx, path, { x: slot.x, y: slot.y, w: slot.w, h: slot.h }, color, pieceStyle.finish);
      ctx.strokeStyle = bg;
      ctx.lineWidth = pieceStyle.gapWidth;
      ctx.stroke(path);
    }
  }, [layout, pieceStyle, colors, cellSize, bg]);

  return <canvas ref={canvasRef} width={width} height={height} className={className} />;
}

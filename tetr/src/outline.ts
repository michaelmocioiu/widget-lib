// Turns a tetromino's cell list into a single contiguous outer boundary --
// used to draw pieces/ghosts/locked blobs as one rounded shape instead of
// separate squares per cell. Works by tracing the shared-edge boundary of
// the unioned unit cells, then classifying each boundary vertex as convex
// (outer corner, gets rounded) or concave (inner bend, stays sharp) via the
// turn direction of the two edges meeting there.
import type { PieceType } from "./types";
import { PIECE_SHAPES } from "./pieces";

export interface OutlineVertex {
  x: number;
  y: number;
  convex: boolean;
}

type Point = [number, number];

export function computeShapeOutline(cells: Point[]): OutlineVertex[] {
  const key = (x: number, y: number) => `${x},${y}`;
  const cellSet = new Set(cells.map(([x, y]) => key(x, y)));
  const has = (x: number, y: number) => cellSet.has(key(x, y));

  const byStart = new Map<string, Point>();
  for (const [x, y] of cells) {
    if (!has(x, y - 1)) byStart.set(key(x, y), [x + 1, y]); // top
    if (!has(x + 1, y)) byStart.set(key(x + 1, y), [x + 1, y + 1]); // right
    if (!has(x, y + 1)) byStart.set(key(x + 1, y + 1), [x, y + 1]); // bottom
    if (!has(x - 1, y)) byStart.set(key(x, y + 1), [x, y]); // left
  }
  if (byStart.size === 0) return [];

  const start = byStart.keys().next().value!;
  const [sx, sy] = start.split(",").map(Number) as [number, number];
  const loop: Point[] = [];
  let cur: Point = [sx, sy];
  // byStart is meant to be a single permutation cycle covering every boundary
  // edge, but two cells of a group touching only diagonally (a "pinch
  // point") makes two edges share a start corner, so one overwrites the
  // other in the map and the walk can end up in a cycle that never revisits
  // (sx, sy). Capping at the edge count (each cell contributes at most 4
  // edges) turns that into a truncated outline instead of an infinite loop.
  const maxSteps = byStart.size + 1;
  for (let steps = 0; steps < maxSteps; steps++) {
    loop.push(cur);
    const next = byStart.get(key(cur[0], cur[1]));
    if (!next) break;
    cur = next;
    if (cur[0] === sx && cur[1] === sy) break;
  }

  const n = loop.length;
  const result: OutlineVertex[] = [];
  for (let i = 0; i < n; i++) {
    const prev = loop[(i - 1 + n) % n];
    const at = loop[i];
    const next = loop[(i + 1) % n];
    const dx1 = at[0] - prev[0];
    const dy1 = at[1] - prev[1];
    const dx2 = next[0] - at[0];
    const dy2 = next[1] - at[1];
    const cross = dx1 * dy2 - dy1 * dx2;
    if (cross === 0) continue; // collinear midpoint, no corner
    result.push({ x: at[0], y: at[1], convex: cross > 0 });
  }
  return result;
}

export const PIECE_OUTLINES: Record<PieceType, OutlineVertex[][]> = Object.fromEntries(
  Object.entries(PIECE_SHAPES).map(([type, rotations]) => [
    type,
    rotations.map((cells) => computeShapeOutline(cells)),
  ]),
) as Record<PieceType, OutlineVertex[][]>;

// Builds a Path2D for an outline whose grid coords are relative to (originX,
// originY) in pixels, at the given cellSize. Convex vertices are rounded by
// `radius` (clamped to half the shorter adjacent edge so tight 1-cell bends
// never overshoot); concave/straight vertices stay sharp.
export function buildRoundedShapePath(
  vertices: OutlineVertex[],
  originX: number,
  originY: number,
  cellSize: number,
  radius: number,
): Path2D {
  const path = new Path2D();
  const n = vertices.length;
  if (n === 0) return path;
  const toPx = (gx: number, gy: number): Point => [originX + gx * cellSize, originY + gy * cellSize];

  let started = false;
  for (let i = 0; i < n; i++) {
    const v = vertices[i];
    const [vx, vy] = toPx(v.x, v.y);
    if (v.convex) {
      const prev = vertices[(i - 1 + n) % n];
      const next = vertices[(i + 1) % n];
      const [px, py] = toPx(prev.x, prev.y);
      const [nx, ny] = toPx(next.x, next.y);
      const d1x = vx - px;
      const d1y = vy - py;
      const len1 = Math.hypot(d1x, d1y);
      const r1 = Math.min(radius, len1 / 2);
      const ax = vx - (d1x / len1) * r1;
      const ay = vy - (d1y / len1) * r1;
      const d2x = nx - vx;
      const d2y = ny - vy;
      const len2 = Math.hypot(d2x, d2y);
      const r2 = Math.min(radius, len2 / 2);
      const bx = vx + (d2x / len2) * r2;
      const by = vy + (d2y / len2) * r2;
      if (!started) {
        path.moveTo(ax, ay);
        started = true;
      } else {
        path.lineTo(ax, ay);
      }
      path.arcTo(vx, vy, bx, by, Math.min(r1, r2));
    } else {
      if (!started) {
        path.moveTo(vx, vy);
        started = true;
      } else {
        path.lineTo(vx, vy);
      }
    }
  }
  path.closePath();
  return path;
}

// Fills a diagonal dashed hatch pattern clipped to `path`, for the ghost
// piece's interior. `bounds` is the shape's own pixel bounding box (a tight
// box keeps the line count small instead of hatching the whole canvas).
export function fillHatchedPath(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  bounds: { x: number; y: number; w: number; h: number },
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.clip(path);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.5;
  const step = 6;
  const diag = bounds.w + bounds.h;
  for (let d = -bounds.h; d < diag; d += step) {
    ctx.beginPath();
    ctx.moveTo(bounds.x + d, bounds.y);
    ctx.lineTo(bounds.x + d + bounds.h, bounds.y + bounds.h);
    ctx.stroke();
  }
  ctx.restore();
}

// Adapted from the original game's snake canvas renderer -- rendering logic
// is copied essentially verbatim; only the identity-color
// lookup (snakeColorFor) is replaced with a plain player/bot 2-color map,
// since there's no identity system in a standalone widget.
import { useEffect, useRef, type RefObject, type MutableRefObject } from "react";
import { TICK_MS } from "./engine";
import { getGridBackgroundLayer } from "./gridBackground";
import { lerpChainEnds } from "./tickInterpolation";
import { drawGlowCircle } from "./canvasFx";
import type { BoardTheme, FaceStyle } from "./settings";
import { BOARD_THEMES } from "./settings";
import type { GridCell, SnakeDeathCause } from "./types";

export const PLAYER_COLOR = "#38bdf8";
export const BOT_COLOR = "#f50b0b";
export const EYE_COLOR = "#ffe8ec";
export const SNAKE_TAPER_RATIO = 0.4;

const SNAKE_TARGET_BOARD_PX = 900;

export function computeSnakeCellSize(gridW: number, gridH: number): number {
  const longestSide = Math.max(gridW, gridH, 1);
  return Math.round(SNAKE_TARGET_BOARD_PX / longestSide);
}

function cellCenter(c: GridCell, cellSize: number) {
  return { x: c.x * cellSize + cellSize / 2, y: c.y * cellSize + cellSize / 2 };
}

function isPlainAdjacent(a: GridCell, b: GridCell) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dx + dy < 2.2;
}

function computeBodyBreaks(body: GridCell[]): boolean[] {
  return body.map((c, i) => i === 0 || !isPlainAdjacent(body[i - 1], c));
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  body: GridCell[],
  breaks: boolean[],
  color: string,
  cellSize: number,
  gridW: number,
  gridH: number,
  t: number,
  face: FaceStyle = "classic",
  alive: boolean = true,
) {
  if (body.length === 0) return;

  const inset = 4.0;
  const maxWidth = cellSize - inset * 2;
  const minWidth = maxWidth * SNAKE_TAPER_RATIO;
  const centers = body.map((c) => cellCenter(c, cellSize));
  const n = body.length;

  const widths = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let effectiveIndex = i + t;
    effectiveIndex = Math.min(n - 1, effectiveIndex);
    if (i === 0) effectiveIndex = 0;
    const effectiveT = n > 1 ? effectiveIndex / (n - 1) : 0;
    widths[i] = maxWidth * (1 - (1 - SNAKE_TAPER_RATIO) * effectiveT);
  }

  const headRadius = Math.min(maxWidth * 0.65, cellSize * 0.46);
  const tailRadius = minWidth / 2;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.shadowBlur = cellSize * 0.2;
  ctx.shadowOffsetX = cellSize * 0.06;
  ctx.shadowOffsetY = cellSize * 0.08;
  ctx.fillStyle = color;

  const drawTaperedSegment = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    wA: number,
    wB: number,
  ) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return;
    const nx = -dy / len;
    const ny = dx / len;

    const p1x = a.x + nx * (wA / 2);
    const p1y = a.y + ny * (wA / 2);
    const p2x = a.x - nx * (wA / 2);
    const p2y = a.y - ny * (wA / 2);
    const p3x = b.x - nx * (wB / 2);
    const p3y = b.y - ny * (wB / 2);
    const p4x = b.x + nx * (wB / 2);
    const p4y = b.y + ny * (wB / 2);

    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineTo(p3x, p3y);
    ctx.lineTo(p4x, p4y);
    ctx.closePath();
    ctx.fill();
  };

  let runStart = 0;
  for (let i = 1; i <= centers.length; i++) {
    if (i < centers.length && !breaks[i]) continue;

    const pts: { x: number; y: number }[] = [];
    const idxs: number[] = [];

    if (runStart > 0 && breaks[runStart]) {
      const prev = body[runStart - 1];
      const curr = body[runStart];
      const dx = Math.abs(prev.x - curr.x);
      const dy = Math.abs(prev.y - curr.y);
      let edgeX, edgeY;
      if (dx > 1 && dy === 0) {
        edgeX = curr.x === 0 ? 0 : gridW * cellSize;
        edgeY = curr.y * cellSize + cellSize / 2;
      } else if (dy > 1 && dx === 0) {
        edgeY = curr.y === 0 ? 0 : gridH * cellSize;
        edgeX = curr.x * cellSize + cellSize / 2;
      } else {
        edgeX = centers[runStart].x;
        edgeY = centers[runStart].y;
      }
      pts.push({ x: edgeX, y: edgeY });
      idxs.push(runStart);
    }

    for (let j = runStart; j < i; j++) {
      pts.push(centers[j]);
      idxs.push(j);
    }

    if (i < body.length && breaks[i]) {
      const last = body[i - 1];
      const next = body[i];
      const dx = Math.abs(last.x - next.x);
      const dy = Math.abs(last.y - next.y);
      let edgeX, edgeY;
      if (dx > 1 && dy === 0) {
        edgeX = last.x === 0 ? 0 : gridW * cellSize;
        edgeY = last.y * cellSize + cellSize / 2;
      } else if (dy > 1 && dx === 0) {
        edgeY = last.y === 0 ? 0 : gridH * cellSize;
        edgeX = last.x * cellSize + cellSize / 2;
      } else {
        edgeX = centers[i - 1].x;
        edgeY = centers[i - 1].y;
      }
      pts.push({ x: edgeX, y: edgeY });
      idxs.push(i - 1);
    }

    for (let j = 0; j < pts.length - 1; j++) {
      const idxA = idxs[j];
      const idxB = idxs[j + 1];
      drawTaperedSegment(pts[j], pts[j + 1], widths[idxA], widths[idxB]);
    }

    for (let j = 1; j < pts.length - 1; j++) {
      const idx = idxs[j];
      if (idx <= 0 || idx >= n - 1) continue;

      const dx1 = pts[j].x - pts[j - 1].x;
      const dy1 = pts[j].y - pts[j - 1].y;
      const dx2 = pts[j + 1].x - pts[j].x;
      const dy2 = pts[j + 1].y - pts[j].y;

      if (dx1 * dy2 - dy1 * dx2 !== 0) {
        const r = widths[idx] / 2;
        ctx.beginPath();
        ctx.arc(pts[j].x, pts[j].y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    runStart = i;
  }

  ctx.beginPath();
  ctx.arc(centers[0].x, centers[0].y, headRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = "transparent";
  const head = centers[0];
  const neck = body[1] ?? { x: body[0].x - 1, y: body[0].y };
  let dx = Math.sign(body[0].x - neck.x);
  let dy = Math.sign(body[0].y - neck.y);
  if (dx === 0 && dy === 0) dx = 1;
  const along = cellSize * 0.18;
  const across = cellSize * 0.16;
  const perpX = -dy * across;
  const perpY = dx * across;
  const eyeR = cellSize * 0.1;
  const pupilR = eyeR * 0.45;
  const pupilAlong = eyeR * 0.4;

  if (!alive) {
    // Dead: X eyes regardless of face style.
    [1, -1].forEach((side) => {
      const eyeX = head.x + dx * along + perpX * side;
      const eyeY = head.y + dy * along + perpY * side;
      const r = eyeR * 0.95;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = Math.max(1.5, eyeR * 0.6);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(eyeX - r, eyeY - r);
      ctx.lineTo(eyeX + r, eyeY + r);
      ctx.moveTo(eyeX - r, eyeY + r);
      ctx.lineTo(eyeX + r, eyeY - r);
      ctx.stroke();
    });
  } else if (face === "sleepy") {
    // Half-closed: a flat lash line (perpendicular to travel) over a small pupil, no eye white.
    const lidHalf = eyeR * 1.1;
    const lidDx = -dy;
    const lidDy = dx;
    [1, -1].forEach((side) => {
      const eyeX = head.x + dx * along + perpX * side;
      const eyeY = head.y + dy * along + perpY * side;
      ctx.strokeStyle = EYE_COLOR;
      ctx.lineWidth = Math.max(1.2, eyeR * 0.4);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(eyeX - lidDx * lidHalf, eyeY - lidDy * lidHalf);
      ctx.lineTo(eyeX + lidDx * lidHalf, eyeY + lidDy * lidHalf);
      ctx.stroke();

      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(eyeX + dx * pupilAlong * 0.6, eyeY + dy * pupilAlong * 0.6, pupilR * 0.8, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (face === "wink") {
    // One eye closed (a flat lash line), the other open with a pupil.
    const lidHalf = eyeR * 1.1;
    const lidDx = -dy;
    const lidDy = dx;
    [1, -1].forEach((side) => {
      const eyeX = head.x + dx * along + perpX * side;
      const eyeY = head.y + dy * along + perpY * side;
      if (side === 1) {
        ctx.strokeStyle = EYE_COLOR;
        ctx.lineWidth = Math.max(1.2, eyeR * 0.4);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(eyeX - lidDx * lidHalf, eyeY - lidDy * lidHalf);
        ctx.lineTo(eyeX + lidDx * lidHalf, eyeY + lidDy * lidHalf);
        ctx.stroke();
      } else {
        ctx.fillStyle = EYE_COLOR;
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(eyeX + dx * pupilAlong, eyeY + dy * pupilAlong, pupilR, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  } else {
    [1, -1].forEach((side) => {
      const eyeX = head.x + dx * along + perpX * side;
      const eyeY = head.y + dy * along + perpY * side;
      ctx.fillStyle = EYE_COLOR;
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(eyeX + dx * pupilAlong, eyeY + dy * pupilAlong, pupilR, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  if (n > 1) {
    ctx.shadowColor = "transparent";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(centers[n - 1].x, centers[n - 1].y, tailRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export interface SnakeCollisionEffect {
  cell: GridCell;
  cause: SnakeDeathCause;
  color: string;
  startedAt: number;
}

export const SNAKE_COLLISION_ANIM_MS: Record<SnakeDeathCause, number> = {
  self: 350,
  crash: 350,
  headon: 550,
  wall: 350,
};

export function isSnakeCollisionEffectExpired(effect: SnakeCollisionEffect, now: number): boolean {
  return now - effect.startedAt >= SNAKE_COLLISION_ANIM_MS[effect.cause];
}

function drawSnakeCollisionEffect(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cellSize: number,
  effect: SnakeCollisionEffect,
  now: number,
) {
  const duration = SNAKE_COLLISION_ANIM_MS[effect.cause];
  const t = Math.min(1, Math.max(0, (now - effect.startedAt) / duration));
  if (t >= 1) return;
  const isHeadOn = effect.cause === "headon";
  const color = isHeadOn ? "#ff5a3c" : effect.color;
  const maxRadius = cellSize * (isHeadOn ? 1.7 : 1.15);
  const radius = maxRadius * (0.3 + 0.7 * t);
  const spikes = isHeadOn ? 9 : 6;

  ctx.save();
  ctx.globalAlpha = 0.8 * (1 - t);
  drawGlowCircle(ctx, cx, cy, radius * 0.35, color, radius * 0.65);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, cellSize * 0.1 * (1 - t));
  for (let i = 0; i < spikes; i++) {
    const angle = (i / spikes) * Math.PI * 2 + t * 0.6;
    const innerR = radius * 0.25;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.stroke();
  }
  ctx.restore();
}

// Deterministic per-cell hash so a given food's variant stays stable across
// frames (position is the only identity foods have -- there's no persistent id).
function hashCell(cell: GridCell): number {
  let h = Math.imul(cell.x + 1, 374761393) ^ Math.imul(cell.y + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 2246822519);
  h ^= h >>> 16;
  return h >>> 0;
}

function drawApple(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  drawGlowCircle(ctx, cx, cy, r, "rgba(224, 52, 47, 0.45)", 5);
  ctx.fillStyle = "#d8332c";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.06, r * 0.92, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.32, cy - r * 0.28, r * 0.22, r * 0.32, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6b4423";
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.78);
  ctx.lineTo(cx + r * 0.14, cy - r * 1.15);
  ctx.stroke();
  ctx.fillStyle = "#3fae4a";
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.42, cy - r * 0.98, r * 0.28, r * 0.16, 0.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawCherries(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  drawGlowCircle(ctx, cx, cy, r, "rgba(200, 20, 60, 0.4)", 5);
  const cr = r * 0.5;
  const left = { x: cx - r * 0.4, y: cy + r * 0.4 };
  const right = { x: cx + r * 0.4, y: cy + r * 0.4 };
  ctx.strokeStyle = "#3fae4a";
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.85);
  ctx.quadraticCurveTo(cx - r * 0.25, cy - r * 0.05, left.x, left.y - cr * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.85);
  ctx.quadraticCurveTo(cx + r * 0.25, cy - r * 0.05, right.x, right.y - cr * 0.6);
  ctx.stroke();
  for (const c of [left, right]) {
    ctx.fillStyle = "#c81d3f";
    ctx.beginPath();
    ctx.arc(c.x, c.y, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.arc(c.x - cr * 0.3, c.y - cr * 0.3, cr * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOrange(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  drawGlowCircle(ctx, cx, cy, r, "rgba(255, 160, 0, 0.4)", 5);
  ctx.fillStyle = "#f5941f";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(190, 105, 0, 0.55)";
  ctx.lineWidth = Math.max(1, r * 0.07);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawGrapes(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  drawGlowCircle(ctx, cx, cy, r, "rgba(140, 60, 200, 0.4)", 5);
  const gr = r * 0.3;
  const offsets: [number, number][] = [
    [-0.4, -0.3],
    [0.4, -0.3],
    [0, -0.6],
    [-0.22, 0.15],
    [0.22, 0.15],
    [0, 0.5],
  ];
  for (const [ox, oy] of offsets) {
    const gx = cx + ox * r;
    const gy = cy + oy * r;
    ctx.fillStyle = "#7b2fb5";
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.arc(gx - gr * 0.3, gy - gr * 0.3, gr * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStrawberry(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  drawGlowCircle(ctx, cx, cy, r, "rgba(255, 50, 80, 0.4)", 5);
  ctx.fillStyle = "#e8264a";
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.8);
  ctx.quadraticCurveTo(cx + r * 0.92, cy - r * 0.25, cx, cy + r * 0.92);
  ctx.quadraticCurveTo(cx - r * 0.92, cy - r * 0.25, cx, cy - r * 0.8);
  ctx.fill();
  ctx.fillStyle = "#ffe08a";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sx = cx + Math.cos(a) * r * 0.38;
    const sy = cy + Math.sin(a) * r * 0.48 + r * 0.1;
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * 0.055, r * 0.09, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#3fae4a";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.33, cy - r * 0.76);
  ctx.lineTo(cx, cy - r * 1.0);
  ctx.lineTo(cx + r * 0.33, cy - r * 0.76);
  ctx.lineTo(cx, cy - r * 0.56);
  ctx.closePath();
  ctx.fill();
}

const FOOD_DRAWERS = [drawApple, drawCherries, drawOrange, drawGrapes, drawStrawberry];

function drawFood(ctx: CanvasRenderingContext2D, cell: GridCell, cellSize: number) {
  const cx = cell.x * cellSize + cellSize / 2;
  const cy = cell.y * cellSize + cellSize / 2;
  const seed = hashCell(cell);
  const pulse = 0.92 + 0.08 * Math.sin(performance.now() / 220 + seed);
  const r = cellSize * 0.34 * pulse;
  ctx.save();
  FOOD_DRAWERS[seed % FOOD_DRAWERS.length](ctx, cx, cy, r);
  ctx.restore();
}

export const SNAKE_PREVIEW_LENGTH = 5;
export const SNAKE_PREVIEW_CELL_SIZE = 28;

// Static mini rendering of a short rightward-facing snake for the settings
// screen's player-color/face swatches -- reuses the same drawBody used for
// the live board so the preview always matches what actually renders in-game.
export function drawSnakePreview(canvas: HTMLCanvasElement, color: string, face: FaceStyle) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cellSize = SNAKE_PREVIEW_CELL_SIZE;
  const length = SNAKE_PREVIEW_LENGTH;
  const body: GridCell[] = Array.from({ length }, (_, i) => ({ x: length - 1 - i, y: 0 }));
  const breaks = body.map((_, i) => i === 0);

  ctx.save();
  ctx.translate(0, canvas.height / 2 - cellSize / 2);
  drawBody(ctx, body, breaks, color, cellSize, length, 1, 1, face);
  ctx.restore();
}

export interface SnakeBoardEntry {
  key: string;
  body: GridCell[];
  color: string;
  face?: FaceStyle;
  alive?: boolean;
}

export function paintCheckeredPattern(ctx: CanvasRenderingContext2D, cellSize: number, theme: BoardTheme) {
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = cellSize * 2;
  patternCanvas.height = cellSize * 2;
  const pctx = patternCanvas.getContext("2d")!;

  pctx.fillStyle = theme.dark;
  pctx.fillRect(0, 0, cellSize, cellSize);
  pctx.fillRect(cellSize, cellSize, cellSize, cellSize);

  pctx.fillStyle = theme.light;
  pctx.fillRect(cellSize, 0, cellSize, cellSize);
  pctx.fillRect(0, cellSize, cellSize, cellSize);

  const pattern = ctx.createPattern(patternCanvas, "repeat")!;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

export function drawSnakeBoard(
  canvas: HTMLCanvasElement,
  grid: { w: number; h: number },
  cellSize: number,
  snakes: SnakeBoardEntry[],
  foods: GridCell[],
  breaksByKey: Map<string, boolean[]>,
  collisionEffects: SnakeCollisionEffect[] = [],
  now: number = performance.now(),
  t: number = 1.0,
  theme: BoardTheme = BOARD_THEMES[0],
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.drawImage(
    getGridBackgroundLayer(grid.w, grid.h, cellSize, `checkered:${theme.id}`, (c) => paintCheckeredPattern(c, cellSize, theme)),
    0,
    0,
  );

  foods.forEach((f) => drawFood(ctx, f, cellSize));
  snakes.forEach((s) =>
    drawBody(ctx, s.body, breaksByKey.get(s.key) ?? [], s.color, cellSize, grid.w, grid.h, t, s.face ?? "classic", s.alive ?? true),
  );
  collisionEffects.forEach((fx) => {
    const c = cellCenter(fx.cell, cellSize);
    drawSnakeCollisionEffect(ctx, c.x, c.y, cellSize, fx, now);
  });
}

class SnakeChainTracker {
  private prevByKey = new Map<string, GridCell[]>();
  private currByKey = new Map<string, GridCell[]>();
  private lastTickTime = performance.now();

  update(snakes: { key: string; body: GridCell[] }[]) {
    let headMoved = false;

    for (const s of snakes) {
      const curr = this.currByKey.get(s.key);
      if (!curr) {
        headMoved = true;
        break;
      }
      if (curr[0]?.x !== s.body[0]?.x || curr[0]?.y !== s.body[0]?.y) {
        headMoved = true;
        break;
      }
    }

    if (headMoved) {
      this.currByKey.forEach((body, key) => {
        this.prevByKey.set(key, body);
      });
      this.currByKey = new Map(snakes.map((s) => [s.key, s.body]));
      this.lastTickTime = performance.now();
    } else {
      for (const s of snakes) {
        this.currByKey.set(s.key, s.body);
      }
    }
  }

  sample(tickMs: number = TICK_MS): Map<string, GridCell[]> {
    const elapsed = performance.now() - this.lastTickTime;
    const t = Math.min(1.0, Math.max(0.0, elapsed / tickMs));

    const result = new Map<string, GridCell[]>();
    this.currByKey.forEach((body, key) => {
      const prev = this.prevByKey.get(key) ?? body;
      result.set(key, lerpChainEnds(prev, body, t));
    });
    return result;
  }

  getInterpolationProgress(tickMs: number = TICK_MS): number {
    const elapsed = performance.now() - this.lastTickTime;
    return Math.min(1, Math.max(0, elapsed / tickMs));
  }
}

function useSnakeChainInterpolator(snakes: { key: string; body: GridCell[] }[]): SnakeChainTracker {
  const ref = useRef<SnakeChainTracker | null>(null);
  if (!ref.current) ref.current = new SnakeChainTracker();
  ref.current.update(snakes);
  return ref.current;
}

export interface SnakeSelfOverride {
  key: string;
  cells: GridCell[];
}

export function useSnakeBoardRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  grid: { w: number; h: number },
  cellSize: number,
  snakes: SnakeBoardEntry[],
  foods: GridCell[],
  selfOverrideRef: RefObject<SnakeSelfOverride | null> | null = null,
  collisionEffectsRef: MutableRefObject<SnakeCollisionEffect[]> | null = null,
  theme: BoardTheme = BOARD_THEMES[0],
  tickMs: number = TICK_MS,
) {
  const chainTracker = useSnakeChainInterpolator(snakes.map((s) => ({ key: s.key, body: s.body })));

  const colorByKey = new Map(snakes.map((s) => [s.key, s.color]));
  const faceByKey = new Map(snakes.map((s) => [s.key, s.face ?? "classic"]));
  const aliveByKey = new Map(snakes.map((s) => [s.key, s.alive ?? true]));
  const keys = snakes.map((s) => s.key);
  const latestRef = useRef({ grid, cellSize, foods, colorByKey, faceByKey, aliveByKey, keys, theme, tickMs });
  latestRef.current = { grid, cellSize, foods, colorByKey, faceByKey, aliveByKey, keys, theme, tickMs };

  useEffect(() => {
    let rafId: number;
    const loop = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const s = latestRef.current;
        const override = selfOverrideRef?.current;
        const sampledBodies = chainTracker.sample(s.tickMs);
        const t = chainTracker.getInterpolationProgress(s.tickMs);
        const sampled = s.keys.map((key) => ({
          key,
          body: override?.key === key ? override.cells : (sampledBodies.get(key) ?? []),
          color: s.colorByKey.get(key) || PLAYER_COLOR,
          face: s.faceByKey.get(key),
          alive: s.aliveByKey.get(key) ?? true,
        }));
        const breaksByKey = new Map(sampled.map((entry) => [entry.key, computeBodyBreaks(entry.body)]));
        const now = performance.now();
        const effects = collisionEffectsRef?.current ?? [];
        drawSnakeBoard(canvas, s.grid, s.cellSize, sampled, s.foods, breaksByKey, effects, now, t, s.theme);
        if (collisionEffectsRef && effects.length > 0) {
          collisionEffectsRef.current = effects.filter((fx) => !isSnakeCollisionEffectExpired(fx, now));
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, chainTracker]);
}

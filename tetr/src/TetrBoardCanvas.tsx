import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { CellValue, PieceType } from "./types";
import type { TetrPlayerState } from "./engine";
import { PIECE_SHAPES, GARBAGE_COLOR, PIECE_STYLES, type PieceStyle } from "./pieces";
import { PIECE_OUTLINES, buildRoundedShapePath, fillHatchedPath, computeShapeOutline, paintStyledShape } from "./outline";
import styles from "./Tetr.module.css";

interface TetrBoardCanvasProps {
  board: TetrPlayerState;
  boardWidth: number;
  boardHeight: number;
  hiddenRows: number;
  pieceColors: Record<string, string>;
  cellSize: number;
  showGhost?: boolean;
  dim?: boolean;
  suppressLockRef?: RefObject<number>;
  pieceStyle?: PieceStyle;
}

type Grid = CellValue[][];

function canPlaceLocal(grid: Grid, boardWidth: number, shape: [number, number][], x: number, y: number) {
  for (const [ox, oy] of shape) {
    const cx = x + ox;
    const cy = y + oy;
    if (cx < 0 || cx >= boardWidth || cy < 0 || cy >= grid.length) return false;
    if (grid[cy][cx] != null) return false;
  }
  return true;
}

function dropLanding(grid: Grid, boardWidth: number, shape: [number, number][], x: number, y: number) {
  let landY = y;
  while (canPlaceLocal(grid, boardWidth, shape, x, landY + 1)) landY++;
  return landY;
}

type CellVal = NonNullable<Grid[number][number]>;

// Groups touching same-value locked cells into one blob per connected
// component (4-directional flood fill), so the settled stack renders as
// smooth rounded regions instead of a grid of separate squares. GARBAGE
// cells exclude vertical neighbors so stacked garbage rows never fuse into
// one blob -- each reads as its own distinct rounded strip.
function computeConnectedGroups(grid: Grid, boardWidth: number, hiddenRows: number) {
  const rows = grid.length;
  const visited: boolean[][] = Array.from({ length: rows }, () => new Array(boardWidth).fill(false));
  const groups: { value: CellVal; cells: [number, number][] }[] = [];
  for (let y = hiddenRows; y < rows; y++) {
    for (let x = 0; x < boardWidth; x++) {
      if (visited[y][x]) continue;
      visited[y][x] = true;
      const value = grid[y][x];
      if (!value) continue;
      const cells: [number, number][] = [[x, y - hiddenRows]];
      const stack: [number, number][] = [[x, y]];
      const isGarbage = value === "GARBAGE";
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        const neighbors: [number, number][] = isGarbage
          ? [[cx + 1, cy], [cx - 1, cy]]
          : [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= boardWidth || ny < hiddenRows || ny >= rows) continue;
          if (visited[ny][nx]) continue;
          if (grid[ny][nx] !== value) continue;
          visited[ny][nx] = true;
          cells.push([nx, ny - hiddenRows]);
          stack.push([nx, ny]);
        }
      }
      groups.push({ value, cells });
    }
  }
  return groups;
}

const SLIDE_MS = 110;
const CLEAR_MS = 220;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInQuad = (t: number) => t * t;

// A piece always spawns at y === 1 (see SPAWN_Y in engine.ts), on both a
// real lock and a hold swap, and a piece's y only ever moves down between
// spawns -- so "current.y is SPAWN_Y this tick, and wasn't already SPAWN_Y
// last tick" is an exact signal that a new piece just replaced the old one.
const SPAWN_Y = 1;
const LOCK_SUPPRESS_AFTER_HOLD_MS = 200;

const BOARD_BG_COLOR = "#14151a";

export function TetrBoardCanvas({
  board,
  boardWidth,
  boardHeight,
  hiddenRows,
  pieceColors,
  cellSize,
  showGhost = false,
  dim = false,
  suppressLockRef,
  pieceStyle = PIECE_STYLES[0],
}: TetrBoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevBoardRef = useRef<TetrPlayerState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = boardWidth * cellSize;
    const h = boardHeight * cellSize;
    const radius = pieceStyle.radiusFactor < 0.1 ? Math.max(0.5, cellSize * pieceStyle.radiusFactor) : Math.max(2, cellSize * pieceStyle.radiusFactor);

    function boundsOfCells(cells: [number, number][]): { x: number; y: number; w: number; h: number } {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [cx, cy] of cells) {
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx + 1);
        maxY = Math.max(maxY, cy + 1);
      }
      return { x: minX * cellSize, y: minY * cellSize, w: (maxX - minX) * cellSize, h: (maxY - minY) * cellSize };
    }

    function drawBackground() {
      ctx!.clearRect(0, 0, w, h);
      ctx!.fillStyle = BOARD_BG_COLOR;
      ctx!.fillRect(0, 0, w, h);
      ctx!.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx!.lineWidth = 1;
      for (let x = 1; x < boardWidth; x++) {
        ctx!.beginPath();
        ctx!.moveTo(x * cellSize + 0.5, 0);
        ctx!.lineTo(x * cellSize + 0.5, h);
        ctx!.stroke();
      }
      for (let y = 1; y < boardHeight; y++) {
        ctx!.beginPath();
        ctx!.moveTo(0, y * cellSize + 0.5);
        ctx!.lineTo(w, y * cellSize + 0.5);
        ctx!.stroke();
      }
    }

    function drawLockedGrid(grid: Grid, offsetForRow?: (visibleY: number) => number, alphaForRow?: (visibleY: number) => number) {
      for (let y = hiddenRows; y < grid.length; y++) {
        const row = grid[y];
        const visibleY = y - hiddenRows;
        const rowOffset = offsetForRow ? offsetForRow(visibleY) : 0;
        const rowAlpha = alphaForRow ? alphaForRow(visibleY) : 1;
        if (rowAlpha <= 0) continue;
        for (let x = 0; x < boardWidth; x++) {
          const cell = row[x];
          if (!cell) continue;
          const color = cell === "GARBAGE" ? GARBAGE_COLOR : pieceColors[cell] || "#888";
          ctx!.globalAlpha = rowAlpha;
          ctx!.fillStyle = color;
          ctx!.fillRect(x * cellSize, visibleY * cellSize + rowOffset, cellSize - 1, cellSize - 1);
        }
      }
      ctx!.globalAlpha = 1;
    }

    function drawLockedGridRounded(grid: Grid) {
      const groups = computeConnectedGroups(grid, boardWidth, hiddenRows);
      for (const group of groups) {
        const outline = computeShapeOutline(group.cells);
        const path = buildRoundedShapePath(outline, 0, 0, cellSize, radius);
        const color = group.value === "GARBAGE" ? GARBAGE_COLOR : pieceColors[group.value] || "#888";
        paintStyledShape(ctx!, path, boundsOfCells(group.cells), color, pieceStyle.finish);
        ctx!.strokeStyle = BOARD_BG_COLOR;
        ctx!.lineWidth = pieceStyle.gapWidth;
        ctx!.stroke(path);
      }
    }

    function drawPieceShape(type: PieceType, rotation: number, gx: number, gy: number, alpha = 1) {
      const outline = PIECE_OUTLINES[type][rotation];
      const originX = gx * cellSize;
      const originY = (gy - hiddenRows) * cellSize;
      const path = buildRoundedShapePath(outline, originX, originY, cellSize, radius);
      const cells = PIECE_SHAPES[type][rotation];
      const bounds = boundsOfCells(cells.map(([ox, oy]) => [gx + ox, gy - hiddenRows + oy] as [number, number]));
      paintStyledShape(ctx!, path, bounds, pieceColors[type] || "#888", pieceStyle.finish, alpha);
    }

    function drawGhostShape(type: PieceType, rotation: number, gx: number, gy: number) {
      const outline = PIECE_OUTLINES[type][rotation];
      const cells = PIECE_SHAPES[type][rotation];
      const originX = gx * cellSize;
      const originY = (gy - hiddenRows) * cellSize;
      const path = buildRoundedShapePath(outline, originX, originY, cellSize, radius);
      const color = pieceColors[type] || "#888";

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [ox, oy] of cells) {
        minX = Math.min(minX, ox);
        minY = Math.min(minY, oy);
        maxX = Math.max(maxX, ox + 1);
        maxY = Math.max(maxY, oy + 1);
      }
      const bounds = {
        x: originX + minX * cellSize,
        y: originY + minY * cellSize,
        w: (maxX - minX) * cellSize,
        h: (maxY - minY) * cellSize,
      };

      fillHatchedPath(ctx!, path, bounds, color, 0.45);
      ctx!.globalAlpha = 0.85;
      ctx!.lineWidth = Math.max(2, cellSize * 0.12);
      ctx!.setLineDash([]);
      ctx!.strokeStyle = color;
      ctx!.stroke(path);
      ctx!.globalAlpha = 1;
    }

    function drawGarbageStrip() {
      if (board.garbageQueue.length === 0) return;
      const totalAmount = board.garbageQueue.reduce((sum, g) => sum + g.amount, 0);
      const nearest = Math.min(...board.garbageQueue.map((g) => g.warnEndAt));
      const now = Date.now();
      const soonFraction = Math.max(0, Math.min(1, 1 - (nearest - now) / 2000));
      const stripHeight = Math.min(totalAmount, boardHeight) * cellSize;
      ctx!.fillStyle = `rgba(220, 50, 50, ${0.35 + soonFraction * 0.5})`;
      ctx!.fillRect(w - 6, h - stripHeight, 5, stripHeight);
    }

    function drawDeadOverlay() {
      if (board.alive) return;
      ctx!.fillStyle = "rgba(0,0,0,0.55)";
      ctx!.fillRect(0, 0, w, h);
    }

    function drawStatic() {
      drawBackground();
      drawLockedGridRounded(board.grid);

      const shape = board.current ? PIECE_SHAPES[board.current.type] : null;
      if (board.current && shape) {
        const { rotation, x: px, y: py, type } = board.current;
        if (showGhost) {
          const ghostY = dropLanding(board.grid, boardWidth, shape[rotation], px, py);
          drawGhostShape(type, rotation, px, ghostY);
        }
        drawPieceShape(type, rotation, px, py);
      }

      drawGarbageStrip();
      drawDeadOverlay();
    }

    const animCtl = { cancelled: false, raf: 0 };
    const prevBoard = prevBoardRef.current;
    prevBoardRef.current = board;

    const lockHappened = !!(
      prevBoard?.current &&
      board.current &&
      board.current.y === SPAWN_Y &&
      prevBoard.current.y !== SPAWN_Y &&
      Date.now() - (suppressLockRef?.current ?? 0) > LOCK_SUPPRESS_AFTER_HOLD_MS
    );

    if (lockHappened && prevBoard?.current) {
      const { type, rotation, x: px, y: startY } = prevBoard.current;
      const shape = PIECE_SHAPES[type][rotation];
      const landY = dropLanding(prevBoard.grid, boardWidth, shape, px, startY);

      const mergedGrid: Grid = prevBoard.grid.map((row) => row.slice());
      for (const [ox, oy] of shape) {
        const cy = landY + oy;
        const cx = px + ox;
        if (cy >= 0 && cy < mergedGrid.length) mergedGrid[cy][cx] = type;
      }
      const clearedRows: number[] = [];
      for (let y = hiddenRows; y < mergedGrid.length; y++) {
        if (mergedGrid[y].every((c) => c != null)) clearedRows.push(y);
      }

      const runClearPhase = (start: number) => {
        const t = Math.min(1, (performance.now() - start) / CLEAR_MS);
        drawBackground();
        drawLockedGrid(
          mergedGrid,
          (visibleY) => {
            const rowIndex = visibleY + hiddenRows;
            if (clearedRows.includes(rowIndex)) return 0;
            const fallCount = clearedRows.filter((cy) => cy > rowIndex).length;
            return fallCount * cellSize * easeOutCubic(t);
          },
          (visibleY) => {
            const rowIndex = visibleY + hiddenRows;
            if (!clearedRows.includes(rowIndex)) return 1;
            return 1 - easeInQuad(t);
          },
        );
        for (const rowIndex of clearedRows) {
          const flashAlpha = (1 - easeInQuad(t)) * 0.75;
          if (flashAlpha <= 0) continue;
          ctx!.globalAlpha = flashAlpha;
          ctx!.fillStyle = "#fff";
          ctx!.fillRect(0, (rowIndex - hiddenRows) * cellSize, w, cellSize - 1);
        }
        ctx!.globalAlpha = 1;
        drawGarbageStrip();
        drawDeadOverlay();

        if (t < 1 && !animCtl.cancelled) {
          animCtl.raf = requestAnimationFrame(() => runClearPhase(start));
        } else if (!animCtl.cancelled) {
          drawStatic();
        }
      };

      const runSlidePhase = (start: number) => {
        const t = Math.min(1, (performance.now() - start) / SLIDE_MS);
        drawBackground();
        drawLockedGridRounded(prevBoard.grid);
        const y = startY + (landY - startY) * easeOutCubic(t);
        drawPieceShape(type, rotation, px, y);
        drawGarbageStrip();
        drawDeadOverlay();

        if (t < 1 && !animCtl.cancelled) {
          animCtl.raf = requestAnimationFrame(() => runSlidePhase(start));
        } else if (!animCtl.cancelled) {
          if (clearedRows.length > 0) runClearPhase(performance.now());
          else drawStatic();
        }
      };

      animCtl.raf = requestAnimationFrame(() => runSlidePhase(performance.now()));
    } else {
      drawStatic();
    }

    return () => {
      animCtl.cancelled = true;
      cancelAnimationFrame(animCtl.raf);
    };
  }, [board, boardWidth, boardHeight, hiddenRows, pieceColors, cellSize, showGhost, suppressLockRef, pieceStyle]);

  return (
    <canvas
      ref={canvasRef}
      width={boardWidth * cellSize}
      height={boardHeight * cellSize}
      className={dim ? `${styles.boardCanvas} ${styles.boardCanvasDim}` : styles.boardCanvas}
    />
  );
}

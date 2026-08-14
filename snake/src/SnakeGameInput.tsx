// Adapted input handling (keyboard,
// touch swipe, on-screen d-pad) and canvas rendering, stripped of the
// socket-driven client-prediction reconciliation (SnakePredictedState/
// useGridPredictor) since a local single-process tick loop has no network
// round trip to hide; player input is applied directly to next tick's
// pendingDirs by the caller (SnakeWidget).
import { useEffect, useRef } from "react";
import { useSnakeBoardRenderer, type SnakeCollisionEffect } from "./snakeCanvas";
import { computeSnakeCellSize, PLAYER_COLOR, BOT_COLOR } from "./snakeCanvas";
import styles from "./Snake.module.css";
import type { Direction, GridCell, SnakeDeathCause } from "./types";

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: "up",
  w: "up",
  W: "up",
  ArrowDown: "down",
  s: "down",
  S: "down",
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
};
const SWIPE_THRESHOLD = 24;

export interface SnakeInputPlayer {
  id: "player" | "bot";
  body: GridCell[];
  alive: boolean;
  deathCause?: SnakeDeathCause | null;
  deathCell?: { x: number; y: number } | null;
}

export interface SnakeGameInputProps {
  grid: { w: number; h: number };
  foods: { x: number; y: number }[];
  players: SnakeInputPlayer[];
  sendDirection: (dir: Direction) => void;
  statusText: string;
}

export function SnakeGameInput({ grid, foods, players, sendDirection, statusText }: SnakeGameInputProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const prevAliveRef = useRef<Map<string, boolean>>(new Map());
  const prevFoodKeysRef = useRef<Set<string> | null>(null);
  const collisionEffectsRef = useRef<SnakeCollisionEffect[]>([]);

  const cellSize = computeSnakeCellSize(grid.w, grid.h);

  const me = players.find((p) => p.id === "player");
  const canAct = me?.alive ?? false;

  const snakes = players
    .filter((p) => p.alive)
    .map((p) => ({
      key: p.id,
      body: p.body,
      color: p.id === "player" ? PLAYER_COLOR : BOT_COLOR,
    }));

  useSnakeBoardRenderer(canvasRef, grid, cellSize, snakes, foods, null, collisionEffectsRef);

  function handleDirection(dir: Direction) {
    sendDirection(dir);
  }

  useEffect(() => {
    const prev = prevAliveRef.current;
    let anyCrashed = false;
    players.forEach((p) => {
      if (prev.get(p.id) && !p.alive) {
        anyCrashed = true;
        if (p.deathCause && p.deathCell) {
          collisionEffectsRef.current.push({
            cell: p.deathCell,
            cause: p.deathCause,
            color: p.id === "player" ? PLAYER_COLOR : BOT_COLOR,
            startedAt: performance.now(),
          });
        }
      }
    });
    void anyCrashed;
    prevAliveRef.current = new Map(players.map((p) => [p.id, p.alive]));
  }, [players]);

  useEffect(() => {
    prevFoodKeysRef.current = new Set(foods.map((f) => `${f.x},${f.y}`));
  }, [foods]);

  useEffect(() => {
    if (!canAct) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const direction = KEY_TO_DIRECTION[e.key];
      if (!direction) return;
      e.preventDefault();
      handleDirection(direction);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAct]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchStartRef.current) e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || !canAct) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
      const direction: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      handleDirection(direction);
    };
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAct]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        width={grid.w * cellSize}
        height={grid.h * cellSize}
        className={styles.canvas}
      />
      <div className={styles.statusLabel}>{statusText}</div>
      <div className={styles.dpad}>
        <button
          type="button"
          className={`${styles.dpadBtn} ${styles.dpadUp}`}
          onPointerDown={() => handleDirection("up")}
          disabled={!canAct}
          aria-label="Up"
        >
          ▲
        </button>
        <button
          type="button"
          className={`${styles.dpadBtn} ${styles.dpadLeft}`}
          onPointerDown={() => handleDirection("left")}
          disabled={!canAct}
          aria-label="Left"
        >
          ◀
        </button>
        <button
          type="button"
          className={`${styles.dpadBtn} ${styles.dpadRight}`}
          onPointerDown={() => handleDirection("right")}
          disabled={!canAct}
          aria-label="Right"
        >
          ▶
        </button>
        <button
          type="button"
          className={`${styles.dpadBtn} ${styles.dpadDown}`}
          onPointerDown={() => handleDirection("down")}
          disabled={!canAct}
          aria-label="Down"
        >
          ▼
        </button>
      </div>
    </div>
  );
}

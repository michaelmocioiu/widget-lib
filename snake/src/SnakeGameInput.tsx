// Adapted input handling (keyboard,
// touch swipe, on-screen d-pad) and canvas rendering, stripped of the
// socket-driven client-prediction reconciliation (SnakePredictedState/
// useGridPredictor) since a local single-process tick loop has no network
// round trip to hide; player input is applied directly to next tick's
// pendingDirs by the caller (SnakeWidget).
import { useEffect, useRef } from "react";
import { useSnakeBoardRenderer, type SnakeCollisionEffect } from "./snakeCanvas";
import { computeSnakeCellSize } from "./snakeCanvas";
import { TICK_MS } from "./engine";
import type { BoardTheme, FaceStyle } from "./settings";
import { BOARD_THEMES } from "./settings";
import styles from "./Snake.module.css";
import type { Direction, GridCell, SnakeDeathCause } from "./types";

const SWIPE_THRESHOLD = 24;

// One entry per human-controlled snake. `keys` lists every keyboard key
// (already normalized: letters lowercased, arrow keys left as-is) that
// steers this snake in each direction -- lets solo/vsBot modes accept both
// WASD and arrow keys, while local2p splits them one set per player.
export interface ControlScheme {
  playerId: string;
  label: string;
  color: string;
  keysLabel: string;
  keys: Record<Direction, string[]>;
}

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

function buildKeyMap(schemes: ControlScheme[]): Map<string, { playerId: string; dir: Direction }> {
  const map = new Map<string, { playerId: string; dir: Direction }>();
  schemes.forEach((scheme) => {
    (Object.keys(scheme.keys) as Direction[]).forEach((dir) => {
      scheme.keys[dir].forEach((key) => map.set(normalizeKey(key), { playerId: scheme.playerId, dir }));
    });
  });
  return map;
}

export interface SnakeInputPlayer {
  id: string;
  body: GridCell[];
  alive: boolean;
  deathCause?: SnakeDeathCause | null;
  deathCell?: { x: number; y: number } | null;
}

export interface SnakeGameInputProps {
  grid: { w: number; h: number };
  foods: { x: number; y: number }[];
  players: SnakeInputPlayer[];
  controlSchemes: ControlScheme[];
  // Every player's snake color, including non-human ones (the bot) that
  // have no ControlScheme entry -- keyed separately so a color source
  // doesn't have to be a controllable player.
  colorByPlayerId: Record<string, string>;
  faceByPlayerId?: Record<string, FaceStyle>;
  boardTheme?: BoardTheme;
  tickMs?: number;
  sendDirection: (playerId: string, dir: Direction) => void;
}

export function SnakeGameInput({
  grid,
  foods,
  players,
  controlSchemes,
  colorByPlayerId,
  faceByPlayerId,
  boardTheme = BOARD_THEMES[0],
  tickMs,
  sendDirection,
}: SnakeGameInputProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const prevAliveRef = useRef<Map<string, boolean>>(new Map());
  const prevFoodKeysRef = useRef<Set<string> | null>(null);
  const collisionEffectsRef = useRef<SnakeCollisionEffect[]>([]);

  const cellSize = computeSnakeCellSize(grid.w, grid.h);

  const aliveByPlayerId = new Map(players.map((p) => [p.id, p.alive]));
  // Single-scheme modes (solo/vsBot) show a touch d-pad for the one human
  // player; shared-keyboard local2p has no sensible touch equivalent.
  const dpadScheme = controlSchemes.length === 1 ? controlSchemes[0] : null;
  const canAct = dpadScheme ? (aliveByPlayerId.get(dpadScheme.playerId) ?? false) : false;

  const snakes = players.map((p) => ({
    key: p.id,
    body: p.body,
    color: colorByPlayerId[p.id] ?? "#38bdf8",
    face: faceByPlayerId?.[p.id],
    alive: p.alive,
  }));

  useSnakeBoardRenderer(canvasRef, grid, cellSize, snakes, foods, null, collisionEffectsRef, boardTheme, tickMs ?? TICK_MS);

  const latestRef = useRef({ aliveByPlayerId, sendDirection });
  latestRef.current = { aliveByPlayerId, sendDirection };

  function handleDirection(playerId: string, dir: Direction) {
    const { aliveByPlayerId: alive, sendDirection: send } = latestRef.current;
    if (!(alive.get(playerId) ?? false)) return;
    send(playerId, dir);
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
            color: colorByPlayerId[p.id] ?? "#38bdf8",
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
    const keyMap = buildKeyMap(controlSchemes);
    const onKeyDown = (e: KeyboardEvent) => {
      const mapped = keyMap.get(normalizeKey(e.key));
      if (!mapped) return;
      e.preventDefault();
      handleDirection(mapped.playerId, mapped.dir);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlSchemes]);

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
      if (!start || !dpadScheme) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
      const direction: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      handleDirection(dpadScheme.playerId, direction);
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
  }, [dpadScheme?.playerId]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        width={grid.w * cellSize}
        height={grid.h * cellSize}
        className={styles.canvas}
      />
      {dpadScheme && (
        <div className={styles.dpad}>
          <button
            type="button"
            className={`${styles.dpadBtn} ${styles.dpadUp}`}
            onPointerDown={() => handleDirection(dpadScheme.playerId, "up")}
            disabled={!canAct}
            aria-label="Up"
          >
            ▲
          </button>
          <button
            type="button"
            className={`${styles.dpadBtn} ${styles.dpadLeft}`}
            onPointerDown={() => handleDirection(dpadScheme.playerId, "left")}
            disabled={!canAct}
            aria-label="Left"
          >
            ◀
          </button>
          <button
            type="button"
            className={`${styles.dpadBtn} ${styles.dpadRight}`}
            onPointerDown={() => handleDirection(dpadScheme.playerId, "right")}
            disabled={!canAct}
            aria-label="Right"
          >
            ▶
          </button>
          <button
            type="button"
            className={`${styles.dpadBtn} ${styles.dpadDown}`}
            onPointerDown={() => handleDirection(dpadScheme.playerId, "down")}
            disabled={!canAct}
            aria-label="Down"
          >
            ▼
          </button>
        </div>
      )}
    </div>
  );
}

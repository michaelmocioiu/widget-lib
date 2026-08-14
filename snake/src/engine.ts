// Standalone port of the original game's server-side snake simulation --
// stepSnakeGame, computeBotSnakeDirection, and checkSnakeWinCondition,
// rewritten as a plain client-side tick loop (no server, no sockets). Rules
// kept faithful to the original: wraparound edges, no-reverse turn queue,
// growth spread one segment per tick, self/crash/head-on collision, a
// chance for each dead segment to become food, and a max-round-length
// stalemate cap.
import type { Direction, GridCell, GameMode } from "./types";

export const GRID_W = 16;
export const GRID_H = 16;
export const START_LENGTH = 5;
export const TICK_MS = 130;
export const FOOD_COUNT = 2;
export const SEGMENTS_PER_DOT = 3;
export const DEATH_FOOD_CHANCE = 0.5;
export const MAX_ROUND_MS = 90000;

const DIRECTION_VECTORS: Record<Direction, GridCell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE_DIR: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export type SnakeDeathCause = "self" | "crash" | "headon" | "wall";

export type PlayerId = string;

// Tunable rules exposed through the settings screen. `edgeWrapping: false`
// means running off the board kills instead of teleporting to the other side.
export interface SnakeGameConfig {
  segmentsPerDot: number;
  foodCount: number;
  edgeWrapping: boolean;
  tickMs: number;
}

export const DEFAULT_GAME_CONFIG: SnakeGameConfig = {
  segmentsPerDot: SEGMENTS_PER_DOT,
  foodCount: FOOD_COUNT,
  edgeWrapping: true,
  tickMs: TICK_MS,
};

export interface SnakePlayerState {
  id: PlayerId;
  body: GridCell[];
  dir: Direction;
  pendingDirs: Direction[];
  alive: boolean;
  growthRemaining: number;
  deathCause: SnakeDeathCause | null;
  deathCell: GridCell | null;
}

export interface SnakeGameState {
  mode: GameMode;
  w: number;
  h: number;
  players: SnakePlayerState[];
  foods: GridCell[];
  startedAt: number;
  resolved: boolean;
  winnerId: PlayerId | null;
  reason: "both_wrong" | "timeout" | null;
  config: SnakeGameConfig;
}

function allOccupiedCells(players: SnakePlayerState[]): GridCell[] {
  const cells: GridCell[] = [];
  players.forEach((p) => {
    if (p.alive) cells.push(...p.body);
  });
  return cells;
}

function randomEmptyCells(occupied: GridCell[], w: number, h: number, count: number): GridCell[] {
  const taken = new Set(occupied.map((c) => `${c.x},${c.y}`));
  const empty: GridCell[] = [];
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (!taken.has(`${x},${y}`)) empty.push({ x, y });
    }
  }
  const picked: GridCell[] = [];
  for (let i = 0; i < count && empty.length > 0; i++) {
    const idx = Math.floor(Math.random() * empty.length);
    picked.push(empty.splice(idx, 1)[0]);
  }
  return picked;
}

function duelSpawns(): { body: GridCell[]; dir: Direction }[] {
  const len = START_LENGTH;
  return [
    { body: Array.from({ length: len }, (_, i) => ({ x: len - 1 - i, y: 2 })), dir: "right" },
    { body: Array.from({ length: len }, (_, i) => ({ x: GRID_W - len + i, y: GRID_H - 3 })), dir: "left" },
  ];
}

function soloSpawn(): { body: GridCell[]; dir: Direction } {
  const len = START_LENGTH;
  return { body: Array.from({ length: len }, (_, i) => ({ x: len - 1 - i, y: Math.floor(GRID_H / 2) })), dir: "right" };
}

// Player ids per mode: solo has just "p1"; vsBot keeps the original
// "player"/"bot" pairing (the bot AI looks for id "bot"); local2p is two
// humans sharing a keyboard, "p1" (WASD) and "p2" (arrow keys).
export function playerIdsForMode(mode: GameMode): PlayerId[] {
  if (mode === "solo") return ["p1"];
  if (mode === "vsBot") return ["player", "bot"];
  return ["p1", "p2"];
}

export function createSnakeGame(mode: GameMode = "vsBot", config: SnakeGameConfig = DEFAULT_GAME_CONFIG): SnakeGameState {
  const ids = playerIdsForMode(mode);
  const spawns = mode === "solo" ? [soloSpawn()] : duelSpawns();
  const players: SnakePlayerState[] = ids.map((id, i) => ({
    id,
    body: spawns[i].body,
    dir: spawns[i].dir,
    pendingDirs: [],
    alive: true,
    growthRemaining: 0,
    deathCause: null,
    deathCell: null,
  }));
  return {
    mode,
    w: GRID_W,
    h: GRID_H,
    players,
    foods: randomEmptyCells(allOccupiedCells(players), GRID_W, GRID_H, config.foodCount),
    startedAt: Date.now(),
    resolved: false,
    winnerId: null,
    reason: null,
    config,
  };
}

// Simple greedy heuristic, verbatim port of computeBotSnakeDirection: among
// non-reversing directions, prefer one that doesn't immediately hit any
// alive snake's body, then pick whichever gets closest to the nearest food
// (wrap-aware distance).
export function computeBotDirection(game: SnakeGameState): Direction | null {
  const self = game.players.find((p) => p.id === "bot")!;
  if (!self.alive || game.foods.length === 0) return null;
  const w = game.w;
  const h = game.h;
  const edgeWrapping = game.config.edgeWrapping;
  const candidates: Direction[] = (["up", "down", "left", "right"] as Direction[]).filter(
    (d) => d !== OPPOSITE_DIR[self.dir],
  );
  const head = self.body[0];
  const occupied = new Set(allOccupiedCells(game.players).map((c) => `${c.x},${c.y}`));

  const inBounds = (c: GridCell) => c.x >= 0 && c.x < w && c.y >= 0 && c.y < h;
  const nextCell = (d: Direction) => {
    const v = DIRECTION_VECTORS[d];
    const raw = { x: head.x + v.x, y: head.y + v.y };
    return edgeWrapping ? { x: (raw.x + w) % w, y: (raw.y + h) % h } : raw;
  };
  // Without wraparound, running off the board is fatal -- never worth
  // choosing over a wall-safe direction unless every option runs off.
  const withinBounds = edgeWrapping ? candidates : candidates.filter((d) => inBounds(nextCell(d)));
  const boundedPool = withinBounds.length > 0 ? withinBounds : candidates;
  const safe = boundedPool.filter((d) => {
    const nc = nextCell(d);
    return !occupied.has(`${nc.x},${nc.y}`);
  });
  const pool = safe.length > 0 ? safe : boundedPool;

  const wrapDist = (a: number, b: number, size: number) => Math.min(Math.abs(a - b), size - Math.abs(a - b));
  const dist1d = (a: number, b: number, size: number) => (edgeWrapping ? wrapDist(a, b, size) : Math.abs(a - b));
  const distanceToNearestFood = (d: Direction) => {
    const nc = nextCell(d);
    return Math.min(...game.foods.map((f) => dist1d(nc.x, f.x, w) + dist1d(nc.y, f.y, h)));
  };
  return pool.reduce((best, d) => (distanceToNearestFood(d) < distanceToNearestFood(best) ? d : best), pool[0]);
}

export function queueDirection(game: SnakeGameState, playerId: PlayerId, dir: Direction) {
  const p = game.players.find((pl) => pl.id === playerId);
  if (p) p.pendingDirs.push(dir);
}

// One full simulation step -- movement, growth, food, collision. Mutates
// `game` in place, same as the server's stepSnakeGame.
export function stepSnakeGame(game: SnakeGameState) {
  const { w, h, foods, players, config } = game;
  const alive = players.filter((p) => p.alive);

  alive.forEach((p) => {
    while (p.pendingDirs.length > 0) {
      const next = p.pendingDirs.shift()!;
      if (next === OPPOSITE_DIR[p.dir]) continue;
      p.dir = next;
      break;
    }
  });

  const died = new Map<SnakePlayerState, boolean>(alive.map((p) => [p, false]));
  const deathInfo = new Map<SnakePlayerState, { cause: SnakeDeathCause; cell: GridCell }>();

  const nextHead = new Map<SnakePlayerState, GridCell>();
  alive.forEach((p) => {
    const v = DIRECTION_VECTORS[p.dir];
    const head = p.body[0];
    const raw = { x: head.x + v.x, y: head.y + v.y };
    if (config.edgeWrapping) {
      nextHead.set(p, { x: (raw.x + w) % w, y: (raw.y + h) % h });
      return;
    }
    if (raw.x < 0 || raw.x >= w || raw.y < 0 || raw.y >= h) {
      const clamped = { x: Math.max(0, Math.min(w - 1, raw.x)), y: Math.max(0, Math.min(h - 1, raw.y)) };
      died.set(p, true);
      deathInfo.set(p, { cause: "wall", cell: clamped });
      nextHead.set(p, clamped);
      return;
    }
    nextHead.set(p, raw);
  });

  const eatenFoodIdx = new Map<SnakePlayerState, number>();
  alive.forEach((p) => {
    if (died.get(p)) return;
    const nh = nextHead.get(p)!;
    const idx = foods.findIndex((f) => f.x === nh.x && f.y === nh.y);
    eatenFoodIdx.set(p, idx);
    if (idx !== -1) p.growthRemaining += config.segmentsPerDot;
  });
  const growingThisTick = new Map(alive.map((p) => [p, p.growthRemaining > 0] as const));

  const bodyForCollision = (p: SnakePlayerState) => {
    const growing = growingThisTick.get(p);
    return growing ? p.body : p.body.slice(0, p.body.length - 1);
  };

  alive.forEach((p) => {
    if (died.get(p)) return;
    const nh = nextHead.get(p)!;
    if (bodyForCollision(p).some((c) => c.x === nh.x && c.y === nh.y)) {
      died.set(p, true);
      deathInfo.set(p, { cause: "self", cell: nh });
    }
  });

  for (let i = 0; i < alive.length; i++) {
    const p = alive[i];
    if (died.get(p)) continue;
    const nh = nextHead.get(p)!;
    for (let j = i + 1; j < alive.length; j++) {
      const o = alive[j];
      if (died.get(o)) continue;
      const no = nextHead.get(o)!;
      const sameTarget = no.x === nh.x && no.y === nh.y;
      const swapped =
        no.x === p.body[0].x && no.y === p.body[0].y && nh.x === o.body[0].x && nh.y === o.body[0].y;
      if (sameTarget || swapped) {
        died.set(p, true);
        died.set(o, true);
        deathInfo.set(p, { cause: "headon", cell: nh });
        deathInfo.set(o, { cause: "headon", cell: no });
      }
    }
  }

  alive.forEach((p) => {
    if (died.get(p)) return;
    const nh = nextHead.get(p)!;
    alive.forEach((o) => {
      if (o === p || died.get(p)) return;
      if (bodyForCollision(o).some((c) => c.x === nh.x && c.y === nh.y)) {
        died.set(p, true);
        deathInfo.set(p, { cause: "crash", cell: nh });
      }
    });
  });

  const eatenIndices = new Set<number>();
  alive.forEach((p) => {
    if (died.get(p)) {
      p.alive = false;
      const info = deathInfo.get(p);
      p.deathCause = info ? info.cause : "crash";
      p.deathCell = info ? info.cell : nextHead.get(p)!;
      p.body.forEach((cell) => {
        if (Math.random() >= DEATH_FOOD_CHANCE) return;
        if (foods.some((f) => f.x === cell.x && f.y === cell.y)) return;
        foods.push({ x: cell.x, y: cell.y });
      });
      return;
    }
    p.body.unshift(nextHead.get(p)!);
    if (growingThisTick.get(p)) {
      p.growthRemaining--;
    } else {
      p.body.pop();
    }
    const idx = eatenFoodIdx.get(p)!;
    if (idx !== -1) eatenIndices.add(idx);
  });

  if (eatenIndices.size > 0) {
    const stillGood = foods.filter((_, i) => !eatenIndices.has(i));
    const fresh = randomEmptyCells([...allOccupiedCells(players), ...stillGood], w, h, eatenIndices.size);
    game.foods = [...stillGood, ...fresh];
  }
}

// Mirrors checkSnakeWinCondition (minus the kill-freeze delay, which is a
// presentation-timing concern the widget's own tick loop/UI handles instead
// of the simulation). Returns true once game.resolved/winnerId/reason are
// set -- caller should stop ticking.
export function checkWinCondition(game: SnakeGameState): boolean {
  if (game.resolved) return true;
  const alive = game.players.filter((p) => p.alive);
  const solo = game.players.length === 1;

  if (solo) {
    if (alive.length === 0) {
      game.resolved = true;
      game.winnerId = null;
      return true;
    }
  } else if (alive.length <= 1) {
    game.resolved = true;
    game.winnerId = alive.length === 1 ? alive[0].id : null;
    game.reason = alive.length === 0 ? "both_wrong" : null;
    return true;
  }

  if (Date.now() - game.startedAt > MAX_ROUND_MS) {
    if (solo) {
      game.resolved = true;
      game.winnerId = game.players[0].id;
      return true;
    }
    const longest = [...game.players].sort((a, b) => b.body.length - a.body.length);
    const tied = longest.filter((p) => p.body.length === longest[0].body.length);
    game.resolved = true;
    game.winnerId = tied.length === 1 ? tied[0].id : null;
    game.reason = tied.length === 1 ? null : "timeout";
    return true;
  }
  return false;
}

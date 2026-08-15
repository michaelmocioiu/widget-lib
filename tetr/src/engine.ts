// Client-side falling-block simulation: piece spawn/gravity/lock-delay/
// soft-drop/hard-drop/hold, 7-bag randomizer, wall-kick nudges, line-clear +
// garbage-attack math (single/double/triple/tetris, combo, back-to-back,
// all-clear bonus, garbage cancel), and a heuristic bot AI. Runs entirely
// client-side on a fixed-rate tick driven by Date.now()-based timers, with
// zero and up-to-one opponent depending on mode (solo has no garbage
// routing at all since there's nowhere for it to go).
import type { CellValue, GameMode, PieceType } from "./types";
import { PIECE_SHAPES, PIECE_TYPES } from "./pieces";

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 21;
export const BOARD_HIDDEN_ROWS = 2;
const TOTAL_HEIGHT = BOARD_HEIGHT + BOARD_HIDDEN_ROWS;

export const NEXT_QUEUE_SIZE = 5;
export const TICK_MS = 50;

const BASE_INITIAL_GRAVITY_MS = 800;
const GRAVITY_RAMP_INTERVAL_MS = 15000;
const GRAVITY_RAMP_FACTOR = 0.85;
const BASE_MIN_GRAVITY_MS = 100;
const SOFT_DROP_MULTIPLIER = 20;
export const DAS_MS = 150;
export const ARR_MS = 30;
const LOCK_DELAY_MS = 500;
const LOCK_DELAY_MAX_RESETS = 15;

const GARBAGE_SINGLE = 0;
const GARBAGE_DOUBLE = 1;
const GARBAGE_TRIPLE = 2;
const GARBAGE_TETRIS = 4;
const GARBAGE_COMBO_STEP = 1;
const GARBAGE_COMBO_CAP = 5;
const GARBAGE_B2B_BONUS = 1;
const GARBAGE_ALL_CLEAR_BONUS = 10;
const GARBAGE_CANCEL = true;
export const GARBAGE_WARNING_MS = 2000;

export type BotDifficulty = "easy" | "medium" | "hard";

// thinkMs: delay before the bot commits to a placement each piece (higher =
// slower reactions). mistakeChance: probability it takes a randomly-worse
// candidate placement instead of its best-scored one, so easy bots visibly
// misplay. lookahead: hard bots also weigh the average of their next
// piece's best placement on top of the immediate one.
interface BotDifficultyConfig {
  thinkMs: number;
  mistakeChance: number;
  lookahead: boolean;
}

const BOT_DIFFICULTY_CONFIG: Record<BotDifficulty, BotDifficultyConfig> = {
  easy: { thinkMs: 2200, mistakeChance: 0.35, lookahead: false },
  medium: { thinkMs: 1400, mistakeChance: 0.1, lookahead: false },
  hard: { thinkMs: 850, mistakeChance: 0, lookahead: true },
};

const LINE_SCORE_BASE = [0, 100, 300, 500, 800];
const SCORE_LINES_PER_LEVEL = 10;
const SCORE_COMBO_STEP = 50;

const SPAWN_X = Math.floor((BOARD_WIDTH - 4) / 2);
// Several piece shapes' cell offsets don't reach row 1 (e.g. O/S/Z/T/J/L's
// top cells sit at oy 0), so spawning at y:0 renders them fully off-screen
// for a moment until gravity drops them into a visible row. Spawning 1 row
// lower gets at least part of every shape into view immediately.
const SPAWN_Y = 1;

// A generic "nudge" wall-kick table -- not the full per-state SRS table
// (T-spins are out of scope for this simple port).
const KICKS: [number, number][] = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]];

export interface GravityConfig {
  initialGravityMs: number;
  minGravityMs: number;
}

export function gravityConfigForSpeed(speedMultiplier: number): GravityConfig {
  return {
    initialGravityMs: BASE_INITIAL_GRAVITY_MS / speedMultiplier,
    minGravityMs: BASE_MIN_GRAVITY_MS / speedMultiplier,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface ActivePiece {
  type: PieceType;
  rotation: number;
  x: number;
  y: number;
}

export interface GarbageChunk {
  amount: number;
  warnEndAt: number;
}

export interface TetrPlayerState {
  id: string;
  isBot: boolean;
  grid: CellValue[][];
  bag: PieceType[];
  nextQueue: PieceType[];
  current: ActivePiece | null;
  held: PieceType | null;
  holdUsedThisPiece: boolean;
  grounded: boolean;
  lockDelayEndAt: number | null;
  lockResets: number;
  lastGravityAt: number;
  softDropping: boolean;
  comboCount: number;
  b2b: boolean;
  garbageQueue: GarbageChunk[];
  totalGarbageSent: number;
  totalGarbageReceived: number;
  linesClearedTotal: number;
  alive: boolean;
  botDecideAt: number;
  botThinkMs: number;
  botMistakeChance: number;
  botLookahead: boolean;
  // Id of the opponent currently receiving this player's garbage. Humans
  // pick one (and can cycle it -- see cycleTarget) whenever 2+ opponents
  // exist; bots pick one too so they can occasionally attack each other
  // instead of always dogpiling the lone human.
  targetId: string | null;
  score: number;
  level: number;
}

export interface TetrGameState {
  mode: GameMode;
  players: TetrPlayerState[];
  gravity: GravityConfig;
  startedAt: number;
  resolved: boolean;
  winnerId: string | null;
}

function emptyGrid(): CellValue[][] {
  return Array.from({ length: TOTAL_HEIGHT }, () => new Array<CellValue>(BOARD_WIDTH).fill(null));
}

function drawPiece(player: TetrPlayerState): PieceType {
  if (player.bag.length === 0) player.bag = shuffle(PIECE_TYPES);
  return player.bag.pop()!;
}

function refillQueue(player: TetrPlayerState) {
  while (player.nextQueue.length < NEXT_QUEUE_SIZE) {
    player.nextQueue.push(drawPiece(player));
  }
}

export function canPlace(grid: CellValue[][], type: PieceType, rotation: number, x: number, y: number): boolean {
  const cells = PIECE_SHAPES[type][rotation];
  for (const [ox, oy] of cells) {
    const cx = x + ox;
    const cy = y + oy;
    if (cx < 0 || cx >= BOARD_WIDTH || cy < 0 || cy >= grid.length) return false;
    if (grid[cy][cx] != null) return false;
  }
  return true;
}

function spawnPiece(player: TetrPlayerState) {
  const type = player.nextQueue.shift()!;
  refillQueue(player);
  player.current = { type, rotation: 0, x: SPAWN_X, y: SPAWN_Y };
  player.holdUsedThisPiece = false;
  player.grounded = false;
  player.lockDelayEndAt = null;
  player.lockResets = 0;
  player.lastGravityAt = Date.now();
  if (player.isBot) player.botDecideAt = Date.now() + player.botThinkMs;
  if (!canPlace(player.grid, type, 0, SPAWN_X, SPAWN_Y)) {
    player.alive = false;
    player.current = null;
  }
}

function ensureGroundedState(player: TetrPlayerState) {
  const p = player.current;
  if (!p) return;
  const onGround = !canPlace(player.grid, p.type, p.rotation, p.x, p.y + 1);
  if (onGround && !player.grounded) {
    player.grounded = true;
    player.lockDelayEndAt = Date.now() + LOCK_DELAY_MS;
  } else if (!onGround) {
    player.grounded = false;
    player.lockDelayEndAt = null;
    player.lockResets = 0;
  }
}

function resetLockDelayOnActiveMove(player: TetrPlayerState) {
  if (player.grounded && player.lockResets < LOCK_DELAY_MAX_RESETS) {
    player.lockDelayEndAt = Date.now() + LOCK_DELAY_MS;
    player.lockResets++;
  }
}

export function tryMove(player: TetrPlayerState, dx: number, dy: number): boolean {
  const p = player.current;
  if (!p || !player.alive) return false;
  const nx = p.x + dx;
  const ny = p.y + dy;
  if (!canPlace(player.grid, p.type, p.rotation, nx, ny)) {
    if (dy > 0) ensureGroundedState(player);
    return false;
  }
  p.x = nx;
  p.y = ny;
  if (dx !== 0) resetLockDelayOnActiveMove(player);
  ensureGroundedState(player);
  return true;
}

export function rotate(player: TetrPlayerState, dir: 1 | -1): boolean {
  const p = player.current;
  if (!p || !player.alive) return false;
  const newRotation = (p.rotation + (dir > 0 ? 1 : 3)) % 4;
  for (const [kx, ky] of KICKS) {
    if (canPlace(player.grid, p.type, newRotation, p.x + kx, p.y + ky)) {
      p.rotation = newRotation;
      p.x += kx;
      p.y += ky;
      resetLockDelayOnActiveMove(player);
      ensureGroundedState(player);
      return true;
    }
  }
  return false;
}

export function hardDrop(game: TetrGameState, player: TetrPlayerState) {
  const p = player.current;
  if (!p || !player.alive) return;
  let ny = p.y;
  while (canPlace(player.grid, p.type, p.rotation, p.x, ny + 1)) ny++;
  p.y = ny;
  lockPiece(game, player);
}

export function holdPiece(player: TetrPlayerState) {
  const p = player.current;
  if (!p || !player.alive || player.holdUsedThisPiece) return;
  if (player.held == null) {
    player.held = p.type;
    player.current = null;
    spawnPiece(player);
  } else {
    const swapped = player.held;
    player.held = p.type;
    player.current = { type: swapped, rotation: 0, x: SPAWN_X, y: SPAWN_Y };
    player.grounded = false;
    player.lockDelayEndAt = null;
    player.lockResets = 0;
    if (!canPlace(player.grid, swapped, 0, SPAWN_X, SPAWN_Y)) {
      player.alive = false;
      player.current = null;
    }
  }
  player.holdUsedThisPiece = true;
}

// Bots mostly gang up on the human but sometimes keep hitting each other
// instead, so a lone human doesn't get overwhelmed by every bot's garbage at
// once. Humans (in local2p or vs multiple bots) attack whichever opponent is
// currently assigned as their target, sticking with it until it dies or
// they cycle it manually (see cycleTarget).
const BOT_RETARGET_CHANCE = 0.2;
const BOT_TARGET_HUMAN_CHANCE = 0.65;

function pickTarget(game: TetrGameState, sender: TetrPlayerState): TetrPlayerState | null {
  if (game.players.length < 2) return null;

  const current = sender.targetId ? game.players.find((p) => p.id === sender.targetId) : undefined;

  if (sender.isBot) {
    if (current && current.alive && Math.random() > BOT_RETARGET_CHANCE) return current;
    const others = game.players.filter((p) => p.id !== sender.id && p.alive);
    if (others.length === 0) return null;
    const human = others.find((p) => !p.isBot);
    const next =
      human && Math.random() < BOT_TARGET_HUMAN_CHANCE
        ? human
        : others[Math.floor(Math.random() * others.length)];
    sender.targetId = next.id;
    return next;
  }

  if (current && current.alive) return current;
  const candidates = game.players.filter((p) => p.id !== sender.id && p.alive);
  const next = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
  sender.targetId = next?.id ?? null;
  return next;
}

// Manually advances a human's target to the next alive opponent (wrapping),
// bound to a dedicated key so the player isn't stuck with whatever target
// was randomly assigned.
export function cycleTarget(game: TetrGameState, sender: TetrPlayerState) {
  const candidates = game.players.filter((p) => p.id !== sender.id && p.alive);
  if (candidates.length === 0) return;
  const idx = candidates.findIndex((p) => p.id === sender.targetId);
  const next = candidates[(idx + 1) % candidates.length];
  sender.targetId = next.id;
}

function routeGarbage(game: TetrGameState, sender: TetrPlayerState, amount: number) {
  const target = pickTarget(game, sender);
  if (!target) return; // solo mode: nowhere for garbage to go
  target.garbageQueue.push({ amount, warnEndAt: Date.now() + GARBAGE_WARNING_MS });
  target.totalGarbageReceived += amount;
}

function applyGarbageRows(player: TetrPlayerState, amount: number) {
  for (let i = 0; i < amount; i++) {
    player.grid.shift();
    const holeCol = Math.floor(Math.random() * BOARD_WIDTH);
    const row = new Array<CellValue>(BOARD_WIDTH).fill("GARBAGE");
    row[holeCol] = null;
    player.grid.push(row);
  }
  if (
    player.current &&
    !canPlace(player.grid, player.current.type, player.current.rotation, player.current.x, player.current.y)
  ) {
    player.alive = false;
    player.current = null;
  }
}

function processGarbage(player: TetrPlayerState) {
  const now = Date.now();
  while (player.garbageQueue.length > 0 && now >= player.garbageQueue[0].warnEndAt) {
    const g = player.garbageQueue.shift()!;
    applyGarbageRows(player, g.amount);
  }
}

function lockPiece(game: TetrGameState, player: TetrPlayerState) {
  const p = player.current;
  if (!p) return;
  for (const [ox, oy] of PIECE_SHAPES[p.type][p.rotation]) {
    const cx = p.x + ox;
    const cy = p.y + oy;
    if (cy >= 0 && cy < player.grid.length && cx >= 0 && cx < BOARD_WIDTH) {
      player.grid[cy][cx] = p.type;
    }
  }
  player.current = null;

  const fullRows: number[] = [];
  for (let y = 0; y < player.grid.length; y++) {
    if (player.grid[y].every((c) => c != null)) fullRows.push(y);
  }
  const lines = fullRows.length;

  if (lines > 0) {
    player.grid = player.grid.filter((_, y) => !fullRows.includes(y));
    while (player.grid.length < TOTAL_HEIGHT) {
      player.grid.unshift(new Array<CellValue>(BOARD_WIDTH).fill(null));
    }
    player.linesClearedTotal += lines;
    player.comboCount = player.comboCount < 0 ? 0 : player.comboCount + 1;
    const comboBonus =
      player.comboCount > 0 ? Math.min(player.comboCount, GARBAGE_COMBO_CAP) * GARBAGE_COMBO_STEP : 0;

    player.level = Math.floor(player.linesClearedTotal / SCORE_LINES_PER_LEVEL) + 1;
    const lineScore = LINE_SCORE_BASE[Math.min(lines, 4)];
    const comboScore = player.comboCount > 0 ? player.comboCount * SCORE_COMBO_STEP : 0;
    player.score += (lineScore + comboScore) * player.level;

    let attack = 0;
    if (lines === 1) attack = GARBAGE_SINGLE;
    else if (lines === 2) attack = GARBAGE_DOUBLE;
    else if (lines === 3) attack = GARBAGE_TRIPLE;
    else attack = GARBAGE_TETRIS;
    attack += comboBonus;

    const difficult = lines >= 2;
    if (difficult) {
      if (player.b2b) attack += GARBAGE_B2B_BONUS;
      player.b2b = true;
    } else {
      player.b2b = false;
    }

    const isAllClear = player.grid.every((row) => row.every((c) => c == null));
    if (isAllClear) attack += GARBAGE_ALL_CLEAR_BONUS;

    if (GARBAGE_CANCEL) {
      let remaining = attack;
      while (remaining > 0 && player.garbageQueue.length > 0) {
        const g = player.garbageQueue[0];
        if (g.amount <= remaining) {
          remaining -= g.amount;
          player.garbageQueue.shift();
        } else {
          g.amount -= remaining;
          remaining = 0;
        }
      }
      attack = remaining;
    }

    if (attack > 0) {
      player.totalGarbageSent += attack;
      routeGarbage(game, player, attack);
    }
  } else {
    player.comboCount = -1;
  }

  spawnPiece(player);
}

// ------------------------- Bot AI -------------------------
function cloneGrid(grid: CellValue[][]): CellValue[][] {
  return grid.map((row) => row.slice());
}

function stampPiece(grid: CellValue[][], type: PieceType, rotation: number, x: number, y: number) {
  for (const [ox, oy] of PIECE_SHAPES[type][rotation]) {
    const cx = x + ox;
    const cy = y + oy;
    if (cy >= 0 && cy < grid.length && cx >= 0 && cx < grid[0].length) {
      grid[cy][cx] = type;
    }
  }
}

function evaluateGrid(grid: CellValue[][]): number {
  const w = grid[0].length;
  const h = grid.length;
  const heights = new Array(w).fill(0);
  let holes = 0;
  for (let x = 0; x < w; x++) {
    let seenBlock = false;
    for (let y = 0; y < h; y++) {
      if (grid[y][x] != null) {
        if (!seenBlock) {
          heights[x] = h - y;
          seenBlock = true;
        }
      } else if (seenBlock) {
        holes++;
      }
    }
  }
  let bumpiness = 0;
  for (let x = 0; x < w - 1; x++) bumpiness += Math.abs(heights[x] - heights[x + 1]);
  const maxHeight = Math.max(...heights);
  const aggHeight = heights.reduce((a, b) => a + b, 0);
  return -(aggHeight * 0.5 + bumpiness * 1 + holes * 4 + maxHeight * 0.5);
}

// Best placement for `type` on `grid`, optionally averaged with the best
// placement of `nextType` on the resulting grid (hard bots' 1-piece
// lookahead), so a locally-great spot that boxes in the next piece scores
// worse than a slightly-worse spot that doesn't.
function bestPlacements(
  grid: CellValue[][],
  type: PieceType,
  startY: number,
  nextType: PieceType | undefined,
  lookahead: boolean,
) {
  const candidates: { rot: number; x: number; ny: number; score: number }[] = [];
  for (let rot = 0; rot < 4; rot++) {
    for (let x = -2; x < BOARD_WIDTH + 2; x++) {
      if (!canPlace(grid, type, rot, x, startY)) continue;
      let ny = startY;
      while (canPlace(grid, type, rot, x, ny + 1)) ny++;
      const clone = cloneGrid(grid);
      stampPiece(clone, type, rot, x, ny);
      let score = evaluateGrid(clone);
      if (lookahead && nextType) {
        const followUp = bestPlacements(clone, nextType, SPAWN_Y, undefined, false);
        if (followUp.length > 0) score = (score + followUp[0].score) / 2;
      }
      candidates.push({ rot, x, ny, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function runBotAI(game: TetrGameState, player: TetrPlayerState) {
  const p = player.current;
  if (!p) return;
  const candidates = bestPlacements(player.grid, p.type, p.y, player.nextQueue[0], player.botLookahead);
  let chosen = candidates[0];
  if (chosen && player.botMistakeChance > 0 && Math.random() < player.botMistakeChance) {
    const pool = candidates.slice(0, Math.min(candidates.length, 5));
    chosen = pool[Math.floor(Math.random() * pool.length)];
  }
  if (chosen) {
    p.rotation = chosen.rot;
    p.x = chosen.x;
    p.y = chosen.ny;
  }
  hardDrop(game, player);
}

// ------------------------- Gravity / tick -------------------------
function currentGravityMs(game: TetrGameState): number {
  const elapsed = Date.now() - game.startedAt;
  const steps = Math.floor(elapsed / GRAVITY_RAMP_INTERVAL_MS);
  const g = game.gravity.initialGravityMs * Math.pow(GRAVITY_RAMP_FACTOR, steps);
  return Math.max(g, game.gravity.minGravityMs);
}

function createPlayer(id: string, isBot: boolean, difficulty: BotDifficulty): TetrPlayerState {
  const botConfig = BOT_DIFFICULTY_CONFIG[difficulty];
  const player: TetrPlayerState = {
    id,
    isBot,
    grid: emptyGrid(),
    bag: [],
    nextQueue: [],
    current: null,
    held: null,
    holdUsedThisPiece: false,
    grounded: false,
    lockDelayEndAt: null,
    lockResets: 0,
    lastGravityAt: Date.now(),
    softDropping: false,
    comboCount: -1,
    b2b: false,
    garbageQueue: [],
    totalGarbageSent: 0,
    totalGarbageReceived: 0,
    linesClearedTotal: 0,
    alive: true,
    botDecideAt: 0,
    botThinkMs: botConfig.thinkMs,
    botMistakeChance: botConfig.mistakeChance,
    botLookahead: botConfig.lookahead,
    targetId: null,
    score: 0,
    level: 1,
  };
  refillQueue(player);
  spawnPiece(player);
  return player;
}

export function createTetrGame(
  mode: GameMode,
  gravity: GravityConfig,
  botCount = 1,
  botDifficulty: BotDifficulty = "medium",
): TetrGameState {
  const players: TetrPlayerState[] = [];
  if (mode === "solo") {
    players.push(createPlayer("player", false, botDifficulty));
  } else if (mode === "vsBot") {
    players.push(createPlayer("player", false, botDifficulty));
    for (let i = 0; i < Math.max(1, botCount); i++) {
      players.push(createPlayer(`bot-${i + 1}`, true, botDifficulty));
    }
  } else {
    players.push(createPlayer("p1", false, botDifficulty));
    players.push(createPlayer("p2", false, botDifficulty));
  }
  return {
    mode,
    players,
    gravity,
    startedAt: Date.now(),
    resolved: false,
    winnerId: null,
  };
}

// Mutates `game` and its players in place, matching the server's tick loop:
// process garbage, spawn if needed, apply gravity/bot AI, resolve lock
// delay. Returns true the tick this game just resolved (top-out), so the
// caller can freeze the board a beat before showing the result.
export function tickTetrGame(game: TetrGameState): boolean {
  if (game.resolved) return false;
  const now = Date.now();

  for (const player of game.players) {
    if (!player.alive) continue;
    processGarbage(player);
    if (!player.alive) continue;
    if (!player.current) spawnPiece(player);
    if (!player.alive) continue;

    if (player.isBot) {
      if (now >= player.botDecideAt) {
        runBotAI(game, player);
      } else {
        const gravity = currentGravityMs(game);
        if (now - player.lastGravityAt >= gravity) {
          player.lastGravityAt = now;
          tryMove(player, 0, 1);
        }
      }
      continue;
    }

    const gravity = currentGravityMs(game) / (player.softDropping ? SOFT_DROP_MULTIPLIER : 1);
    if (now - player.lastGravityAt >= gravity) {
      player.lastGravityAt = now;
      tryMove(player, 0, 1);
    }
    if (player.grounded && player.lockDelayEndAt && now >= player.lockDelayEndAt) {
      lockPiece(game, player);
    }
  }

  if (game.mode === "solo") {
    if (!game.players[0].alive) {
      game.resolved = true;
      game.winnerId = null;
      return true;
    }
    return false;
  }

  if (game.mode === "vsBot") {
    const human = game.players.find((p) => !p.isBot)!;
    const aliveBots = game.players.filter((p) => p.isBot && p.alive);
    if (!human.alive) {
      game.resolved = true;
      game.winnerId = aliveBots[0]?.id ?? null;
      return true;
    }
    if (aliveBots.length === 0) {
      game.resolved = true;
      game.winnerId = human.id;
      return true;
    }
    return false;
  }

  const alive = game.players.filter((p) => p.alive);
  if (alive.length <= 1) {
    game.resolved = true;
    game.winnerId = alive.length === 1 ? alive[0].id : null;
    return true;
  }
  return false;
}

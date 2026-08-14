import { useEffect, useMemo, useRef, useState } from "react";
import {
  createSnakeGame,
  stepSnakeGame,
  computeBotDirection,
  checkWinCondition,
  queueDirection,
  TICK_MS,
  type SnakeGameState,
} from "./engine";
import { SnakeGameInput, type ControlScheme } from "./SnakeGameInput";
import { PLAYER_COLOR, BOT_COLOR } from "./snakeCanvas";
import styles from "./Snake.module.css";
import type { Direction, GameMode } from "./types";

const KILL_FREEZE_MS = 900;
const COUNTDOWN_START = 3;
const COUNTDOWN_STEP_MS = 800;

const WASD: Record<Direction, string[]> = { up: ["w"], down: ["s"], left: ["a"], right: ["d"] };
const ARROWS: Record<Direction, string[]> = { up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"] };
const BOTH: Record<Direction, string[]> = {
  up: ["w", "ArrowUp"],
  down: ["s", "ArrowDown"],
  left: ["a", "ArrowLeft"],
  right: ["d", "ArrowRight"],
};

function controlSchemesForMode(mode: GameMode): ControlScheme[] {
  if (mode === "local2p") {
    return [
      { playerId: "p1", label: "Player 1", color: PLAYER_COLOR, keysLabel: "WASD", keys: WASD },
      { playerId: "p2", label: "Player 2", color: BOT_COLOR, keysLabel: "Arrow Keys", keys: ARROWS },
    ];
  }
  const soloId = mode === "vsBot" ? "player" : "p1";
  return [{ playerId: soloId, label: "You", color: PLAYER_COLOR, keysLabel: "Arrows / WASD", keys: BOTH }];
}

// Describes who controls what for a mode, including non-human entries (the
// bot) that controlSchemesForMode doesn't cover -- used by the mode-select
// overlay so players know what they're picking before the round starts.
interface ControlSummaryEntry {
  label: string;
  color: string;
  text: string;
}

function controlSummaryForMode(mode: GameMode): ControlSummaryEntry[] {
  if (mode === "solo") return [{ label: "You", color: PLAYER_COLOR, text: "Arrows or WASD" }];
  if (mode === "vsBot") {
    return [
      { label: "You", color: PLAYER_COLOR, text: "Arrows or WASD" },
      { label: "Bot", color: BOT_COLOR, text: "CPU controlled" },
    ];
  }
  return [
    { label: "Player 1", color: PLAYER_COLOR, text: "WASD" },
    { label: "Player 2", color: BOT_COLOR, text: "Arrow Keys" },
  ];
}

function colorsForMode(mode: GameMode): Record<string, string> {
  if (mode === "solo") return { p1: PLAYER_COLOR };
  if (mode === "vsBot") return { player: PLAYER_COLOR, bot: BOT_COLOR };
  return { p1: PLAYER_COLOR, p2: BOT_COLOR };
}

function displayName(mode: GameMode, id: string): string {
  if (mode === "vsBot") return id === "player" ? "You" : "Bot";
  if (mode === "local2p") return id === "p1" ? "Player 1" : "Player 2";
  return "You";
}

const MODE_OPTIONS: { mode: GameMode; label: string; blurb: string }[] = [
  { mode: "solo", label: "1 Player", blurb: "Classic solo snake" },
  { mode: "local2p", label: "2 Player", blurb: "Shared keyboard duel" },
  { mode: "vsBot", label: "1 Player vs AI", blurb: "Race the bot" },
];

type Phase = "menu" | "countdown" | "playing";

export function SnakeWidget() {
  const [mode, setMode] = useState<GameMode>("vsBot");
  const [phase, setPhase] = useState<Phase>("menu");
  const [game, setGame] = useState<SnakeGameState>(() => createSnakeGame("vsBot"));
  const [score, setScore] = useState<Record<string, number>>({});
  const [resultText, setResultText] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  const gameRef = useRef<SnakeGameState>(game);
  gameRef.current = game;
  // Freezes the board the instant a round resolves, independent of the
  // KILL_FREEZE_MS delay before the menu overlay reappears -- a plain ref
  // (not state) since nothing needs to re-render off this flag directly.
  const roundOverRef = useRef(false);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const controlSchemes = useMemo(() => controlSchemesForMode(mode), [mode]);
  const colorByPlayerId = useMemo(() => colorsForMode(mode), [mode]);

  useEffect(() => {
    if (phase !== "playing") return;
    const interval = setInterval(() => {
      if (roundOverRef.current) return;
      const prev = gameRef.current;
      // stepSnakeGame mutates each player's `body` array in place
      // (unshift/pop). The real server gets away with this because the
      // socket payload is a fresh JSON-parsed array every tick, but here
      // there's no serialization step -- `prev.players[i].body` is the very
      // same array reference SnakeChainTracker cached as `currByKey` on the
      // last render. Cloning it AFTER stepping (as before) is too late: the
      // in-place mutation already corrupts that cached snapshot before the
      // tracker ever compares old vs. new, so headMoved is always false and
      // interpolation never advances. Clone first, then step the clone.
      const g = { ...prev, players: prev.players.map((p) => ({ ...p, body: [...p.body] })), foods: [...prev.foods] };

      if (mode === "vsBot") {
        const botDir = computeBotDirection(g);
        if (botDir) queueDirection(g, "bot", botDir);
      }

      stepSnakeGame(g);
      const finished = checkWinCondition(g);
      setGame(g);

      if (finished) {
        roundOverRef.current = true;
        setTimeout(() => {
          let outcome: string;
          if (g.winnerId) {
            setScore((s) => ({ ...s, [g.winnerId as string]: (s[g.winnerId as string] ?? 0) + 1 }));
            outcome = `${displayName(mode, g.winnerId)} wins!`;
          } else {
            outcome = mode === "solo" ? "Game over" : "Draw!";
          }
          setResultText(outcome);
          setPhase("menu");
        }, KILL_FREEZE_MS);
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [phase, mode]);

  // 3, 2, 1, then "playing" -- the actual tick loop only starts once this
  // finishes, so nothing can move (or die) mid-countdown.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setPhase("playing");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), COUNTDOWN_STEP_MS);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  function handleDirection(playerId: string, dir: Direction) {
    if (phaseRef.current !== "playing" || roundOverRef.current) return;
    queueDirection(gameRef.current, playerId, dir);
  }

  function startMode(next: GameMode) {
    const fresh = createSnakeGame(next);
    gameRef.current = fresh;
    roundOverRef.current = false;
    setMode(next);
    setGame(fresh);
    setScore({});
    setResultText(null);
    setCountdown(COUNTDOWN_START);
    setPhase("countdown");
  }

  const alivePlayers = game.players.filter((p) => p.alive);

  let statusText: string;
  if (phase === "menu") {
    statusText = "Choose a mode to begin";
  } else if (phase === "countdown") {
    statusText = countdown > 0 ? String(countdown) : "Go!";
  } else if (mode === "solo") {
    statusText = "Go!";
  } else if (alivePlayers.length === game.players.length) {
    statusText = "Go!";
  } else {
    const stillAlive = alivePlayers[0];
    statusText = stillAlive
      ? `${displayName(mode, game.players.find((p) => !p.alive)!.id)} crashed -- waiting on ${displayName(mode, stillAlive.id)}...`
      : "Go!";
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.scoreRow}>
        {phase === "menu" ? null : mode === "solo" ? (
          <span>Length: {game.players[0].body.length}</span>
        ) : (
          game.players.map((p) => (
            <span key={p.id}>
              {displayName(mode, p.id)}: {score[p.id] ?? 0}
            </span>
          ))
        )}
      </div>
      <div className={styles.canvasWrap}>
        <SnakeGameInput
          grid={{ w: game.w, h: game.h }}
          foods={game.foods}
          players={game.players}
          controlSchemes={controlSchemes}
          colorByPlayerId={colorByPlayerId}
          sendDirection={handleDirection}
          statusText={phase === "menu" ? "" : statusText}
        />
        {phase === "countdown" && (
          <div className={styles.overlay}>
            <div className={styles.countdownNum}>{countdown > 0 ? countdown : "Go!"}</div>
          </div>
        )}
        {phase === "menu" && (
          <div className={`${styles.overlay} ${styles.menuOverlay}`}>
            <h2 className={styles.menuTitle}>{resultText ?? "Snake Duel"}</h2>
            <div className={styles.menu}>
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  className={styles.menuBtn}
                  onClick={() => startMode(opt.mode)}
                >
                  <span className={styles.menuBtnLabel}>{opt.label}</span>
                  <span className={styles.menuBtnBlurb}>{opt.blurb}</span>
                  <span className={styles.controlLegend}>
                    {controlSummaryForMode(opt.mode).map((entry) => (
                      <span key={entry.label} className={styles.controlLegendItem}>
                        <span className={styles.controlSwatch} style={{ background: entry.color }} />
                        {entry.label}: {entry.text}
                      </span>
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

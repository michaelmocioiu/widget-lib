import { useEffect, useMemo, useRef, useState } from "react";
import {
  createSnakeGame,
  stepSnakeGame,
  computeBotDirection,
  checkWinCondition,
  queueDirection,
  type SnakeGameState,
} from "./engine";
import { SnakeGameInput, type ControlScheme } from "./SnakeGameInput";
import { SettingsScreen } from "./SettingsScreen";
import {
  boardThemeById,
  loadSettings,
  saveSettings,
  settingsToGameConfig,
  type FaceStyle,
  type SnakeSettings,
} from "./settings";
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

function controlSchemesForMode(mode: GameMode, settings: SnakeSettings): ControlScheme[] {
  if (mode === "local2p") {
    return [
      { playerId: "p1", label: "Player 1", color: settings.p1.color, keysLabel: "WASD", keys: WASD },
      { playerId: "p2", label: "Player 2", color: settings.p2.color, keysLabel: "Arrow Keys", keys: ARROWS },
    ];
  }
  const soloId = mode === "vsBot" ? "player" : "p1";
  return [{ playerId: soloId, label: "You", color: settings.p1.color, keysLabel: "Arrows / WASD", keys: BOTH }];
}

// Describes who controls what for a mode, including non-human entries (the
// bot) that controlSchemesForMode doesn't cover -- used by the mode-select
// overlay so players know what they're picking before the round starts.
interface ControlSummaryEntry {
  label: string;
  color: string;
  text: string;
}

function controlSummaryForMode(mode: GameMode, settings: SnakeSettings): ControlSummaryEntry[] {
  if (mode === "solo") return [{ label: "You", color: settings.p1.color, text: "Arrows or WASD" }];
  if (mode === "vsBot") {
    return [
      { label: "You", color: settings.p1.color, text: "Arrows or WASD" },
      { label: "Bot", color: settings.p2.color, text: "CPU controlled" },
    ];
  }
  return [
    { label: "Player 1", color: settings.p1.color, text: "WASD" },
    { label: "Player 2", color: settings.p2.color, text: "Arrow Keys" },
  ];
}

function colorsForMode(mode: GameMode, settings: SnakeSettings): Record<string, string> {
  if (mode === "solo") return { p1: settings.p1.color };
  if (mode === "vsBot") return { player: settings.p1.color, bot: settings.p2.color };
  return { p1: settings.p1.color, p2: settings.p2.color };
}

function facesForMode(mode: GameMode, settings: SnakeSettings): Record<string, FaceStyle> {
  if (mode === "solo") return { p1: settings.p1.face };
  if (mode === "vsBot") return { player: settings.p1.face, bot: settings.p2.face };
  return { p1: settings.p1.face, p2: settings.p2.face };
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
type MenuView = "modes" | "settings";

export function SnakeWidget() {
  const [mode, setMode] = useState<GameMode>("vsBot");
  const [phase, setPhase] = useState<Phase>("menu");
  const [menuView, setMenuView] = useState<MenuView>("modes");
  const [settings, setSettings] = useState<SnakeSettings>(() => loadSettings());
  const [game, setGame] = useState<SnakeGameState>(() => createSnakeGame("vsBot", settingsToGameConfig(loadSettings())));
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
  const controlSchemes = useMemo(() => controlSchemesForMode(mode, settings), [mode, settings]);
  const colorByPlayerId = useMemo(() => colorsForMode(mode, settings), [mode, settings]);
  const faceByPlayerId = useMemo(() => facesForMode(mode, settings), [mode, settings]);
  const boardTheme = useMemo(() => boardThemeById(settings.boardThemeId), [settings.boardThemeId]);

  function updateSettings(next: SnakeSettings) {
    setSettings(next);
    saveSettings(next);
  }

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
            outcome = `${displayName(mode, g.winnerId)} Won!`;
          } else {
            outcome = mode === "solo" ? "Game Over" : "Draw!";
          }
          setResultText(outcome);
          setPhase("menu");
        }, KILL_FREEZE_MS);
      }
    }, game.config.tickMs);
    return () => clearInterval(interval);
  }, [phase, mode, game.config.tickMs]);

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
    const fresh = createSnakeGame(next, settingsToGameConfig(settings));
    gameRef.current = fresh;
    roundOverRef.current = false;
    setMode(next);
    setGame(fresh);
    setResultText(null);
    setCountdown(COUNTDOWN_START);
    setPhase("countdown");
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.canvasWrap}>
        <SnakeGameInput
          grid={{ w: game.w, h: game.h }}
          foods={game.foods}
          players={game.players}
          controlSchemes={controlSchemes}
          colorByPlayerId={colorByPlayerId}
          faceByPlayerId={faceByPlayerId}
          boardTheme={boardTheme}
          tickMs={game.config.tickMs}
          sendDirection={handleDirection}
        />
        {phase === "countdown" && (
          <div className={styles.overlay}>
            <div className={styles.countdownNum}>{countdown > 0 ? countdown : "Go!"}</div>
          </div>
        )}
        {phase === "menu" && menuView === "settings" && (
          <div className={`${styles.overlay} ${styles.menuOverlay}`}>
            <SettingsScreen settings={settings} onChange={updateSettings} onBack={() => setMenuView("modes")} />
          </div>
        )}
        {phase === "menu" && menuView === "modes" && (
          <div className={`${styles.overlay} ${styles.menuOverlay}`}>
            <button
              type="button"
              className={styles.cornerBtn}
              onClick={() => setMenuView("settings")}
              aria-label="Settings"
            >
              <GearIcon />
            </button>
            <h2 className={styles.menuTitle}>{resultText ?? "Snake Duel"}</h2>
            <p className={styles.menuSubtitle}>{resultText ? "Play again?" : "By Michael Mocioiu"}</p>
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
                    {controlSummaryForMode(opt.mode, settings).map((entry) => (
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

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

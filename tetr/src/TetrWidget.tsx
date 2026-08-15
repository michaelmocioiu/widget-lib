import { useEffect, useMemo, useRef, useState } from "react";
import {
  createTetrGame,
  tickTetrGame,
  tryMove,
  rotate,
  hardDrop,
  holdPiece,
  cycleTarget,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  BOARD_HIDDEN_ROWS,
  TICK_MS,
  type TetrGameState,
  type TetrPlayerState,
} from "./engine";
import { TetrBoardPanel } from "./TetrBoardPanel";
import { useTetrFitScale } from "./useTetrFitScale";
import { SettingsScreen } from "./SettingsScreen";
import {
  loadSettings,
  saveSettings,
  settingsToGravityConfig,
  settingsToColors,
  settingsToPieceStyle,
  type TetrSettings,
} from "./settings";
import type { TetrControlActions, TetrControlScheme } from "./useTetrKeyboardInput";
import styles from "./Tetr.module.css";
import type { GameMode } from "./types";

const KILL_FREEZE_MS = 900;
const COUNTDOWN_START = 3;
const COUNTDOWN_STEP_MS = 800;
// Smaller than the solo/vsBot self-view cell size so two full boards (each
// with its own HUD) sit side by side without wrapping to a vertical stack.
const LOCAL2P_CELL_SIZE = 20;

// Two non-overlapping key sets for local2p (the single-player modes accept
// both clusters at once so either hand works solo). "ShiftLeft" is matched
// against `e.code` (see useTetrKeyboardInput) since `e.key` can't tell
// left-Shift from right-Shift.
const P1_SCHEME_KEYS = {
  left: ["a"], right: ["d"], softDrop: ["s"],
  rotateCw: ["w"], rotateCcw: ["q"], hardDrop: [" "], hold: ["ShiftLeft"], cycleTarget: [] as string[],
};
const P2_SCHEME_KEYS = {
  left: ["ArrowLeft"], right: ["ArrowRight"], softDrop: ["ArrowDown"],
  rotateCw: ["ArrowUp"], rotateCcw: ["/"], hardDrop: ["Enter"], hold: ["."], cycleTarget: [] as string[],
};
const SOLO_SCHEME_KEYS = {
  left: [...P1_SCHEME_KEYS.left, ...P2_SCHEME_KEYS.left],
  right: [...P1_SCHEME_KEYS.right, ...P2_SCHEME_KEYS.right],
  softDrop: [...P1_SCHEME_KEYS.softDrop, ...P2_SCHEME_KEYS.softDrop],
  rotateCw: [...P1_SCHEME_KEYS.rotateCw, ...P2_SCHEME_KEYS.rotateCw],
  rotateCcw: [...P1_SCHEME_KEYS.rotateCcw, ...P2_SCHEME_KEYS.rotateCcw],
  hardDrop: [...P1_SCHEME_KEYS.hardDrop, ...P2_SCHEME_KEYS.hardDrop],
  hold: [...P1_SCHEME_KEYS.hold, ...P2_SCHEME_KEYS.hold],
  // Only meaningful in vsBot (with an opponent to cycle to) -- bound to a
  // dedicated key rather than a modifier since neither P1/P2 cluster uses
  // Shift/Ctrl and `e.key` can't disambiguate left/right modifiers anyway.
  cycleTarget: ["c"],
};

function schemesForMode(mode: GameMode): TetrControlScheme[] {
  if (mode === "local2p") {
    return [
      { playerId: "p1", label: "Player 1", color: "#38bdf8", keysLabel: "WASD + Q/Shift/Space", ...P1_SCHEME_KEYS },
      { playerId: "p2", label: "Player 2", color: "#f97316", keysLabel: "Arrows + . / / / Enter", ...P2_SCHEME_KEYS },
    ];
  }
  return [{ playerId: "player", label: "You", color: "#38bdf8", keysLabel: "Arrows or WASD", ...SOLO_SCHEME_KEYS }];
}

interface ControlSummaryEntry {
  label: string;
  color: string;
  text: string;
}

function controlSummaryForMode(mode: GameMode): ControlSummaryEntry[] {
  if (mode === "solo") return [{ label: "You", color: "#38bdf8", text: "Arrows or WASD, Space to drop" }];
  if (mode === "vsBot") {
    return [
      { label: "You", color: "#38bdf8", text: "Arrows or WASD, Space to drop" },
      { label: "Bot", color: "#f97316", text: "CPU controlled" },
    ];
  }
  return [
    { label: "Player 1", color: "#38bdf8", text: "WASD, Q/E rotate, Space drop" },
    { label: "Player 2", color: "#f97316", text: "Arrows, ./  rotate, Enter drop" },
  ];
}

function displayName(mode: GameMode, id: string): string {
  if (mode === "vsBot") {
    if (id === "player") return "You";
    const n = id.startsWith("bot-") ? id.slice(4) : "";
    return n ? `Bot ${n}` : "Bot";
  }
  if (mode === "local2p") return id === "p1" ? "Player 1" : "Player 2";
  return "You";
}

const MODE_OPTIONS: { mode: GameMode; label: string; blurb: string }[] = [
  { mode: "solo", label: "1 Player", blurb: "Marathon: survive the ramping speed" },
  { mode: "vsBot", label: "1 Player vs AI", blurb: "Duel bots -- clear lines to send garbage (bot count in Settings)" },
  { mode: "local2p", label: "2 Player", blurb: "Shared keyboard duel" },
];

// Matches the CSS media query that shows on-screen touch controls
// (Tetr.module.css `.controls` / `@media (hover: none) and (pointer:
// coarse)`) -- local2p needs a shared physical keyboard, which touch
// devices don't have.
function isTouchDevice(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

type Phase = "menu" | "countdown" | "playing" | "paused";
type MenuView = "modes" | "settings";

const KEY_LABELS: Record<string, string> = {
  " ": "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ShiftLeft: "Shift",
};

function prettyKey(key: string): string {
  return KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

function keysText(keys: string[]): string {
  return keys.map(prettyKey).join(" / ");
}

interface PauseControlRow {
  label: string;
  keys: string;
}

function pauseControlRows(scheme: TetrControlScheme): PauseControlRow[] {
  const rows: PauseControlRow[] = [
    { label: "Move", keys: `${keysText(scheme.left)}  ${keysText(scheme.right)}` },
    { label: "Soft Drop", keys: keysText(scheme.softDrop) },
    { label: "Hard Drop", keys: keysText(scheme.hardDrop) },
    { label: "Rotate CW", keys: keysText(scheme.rotateCw) },
    { label: "Rotate CCW", keys: keysText(scheme.rotateCcw) },
    { label: "Hold", keys: keysText(scheme.hold) },
  ];
  if (scheme.cycleTarget.length > 0) {
    rows.push({ label: "Switch Target", keys: keysText(scheme.cycleTarget) });
  }
  return rows;
}

function resultTextFor(mode: GameMode, game: TetrGameState): string {
  if (mode === "solo") {
    const lines = game.players[0].linesClearedTotal;
    return `Game Over -- ${lines} line${lines === 1 ? "" : "s"} cleared`;
  }
  if (!game.winnerId) return "Draw!";
  return `${displayName(mode, game.winnerId)} Won!`;
}

export function TetrWidget() {
  const [isMobile] = useState<boolean>(() => isTouchDevice());
  const modeOptions = useMemo(
    () => (isMobile ? MODE_OPTIONS.filter((opt) => opt.mode !== "local2p") : MODE_OPTIONS),
    [isMobile],
  );
  const [mode, setMode] = useState<GameMode>("vsBot");
  const [phase, setPhase] = useState<Phase>("menu");
  const [menuView, setMenuView] = useState<MenuView>("modes");
  const [settings, setSettings] = useState<TetrSettings>(() => loadSettings());
  const [game, setGame] = useState<TetrGameState>(() => {
    const initial = loadSettings();
    return createTetrGame("vsBot", settingsToGravityConfig(initial), initial.botCount, initial.botDifficulty);
  });
  const [resultText, setResultText] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  const gameRef = useRef<TetrGameState>(game);
  gameRef.current = game;
  const roundOverRef = useRef(false);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  const pieceColors = useMemo(() => settingsToColors(settings), [settings.paletteId]);
  const pieceStyle = useMemo(() => settingsToPieceStyle(settings), [settings.pieceStyleId]);
  const schemes = useMemo(() => schemesForMode(mode), [mode]);

  function updateSettings(next: TetrSettings) {
    setSettings(next);
    saveSettings(next);
  }

  useEffect(() => {
    if (phase !== "playing") return;
    const interval = setInterval(() => {
      if (roundOverRef.current) return;
      const g = gameRef.current;
      const resolved = tickTetrGame(g);
      // Shallow-clone each player so React sees a new reference every tick
      // (the engine mutates grid/current/etc. in place, same as the server
      // did before JSON-serializing a fresh payload each broadcast).
      const rendered: TetrGameState = { ...g, players: g.players.map((p) => ({ ...p })) };
      setGame(rendered);

      if (resolved) {
        roundOverRef.current = true;
        setTimeout(() => {
          setResultText(resultTextFor(mode, g));
          setPhase("menu");
        }, KILL_FREEZE_MS);
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [phase, mode]);

  // 3, 2, 1, then "playing" -- the tick loop only starts once this finishes.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setPhase("playing");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), COUNTDOWN_STEP_MS);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // Escape toggles pause independent of the per-board keyboard hooks (those
  // detach their listeners whenever a board isn't `enabled`, which is also
  // true while paused) -- this one stays mounted for the whole widget so
  // Escape keeps working to pause/resume.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (phaseRef.current === "playing") {
        e.preventDefault();
        setPhase("paused");
      } else if (phaseRef.current === "paused") {
        e.preventDefault();
        setPhase("playing");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function resumeGame() {
    setPhase("playing");
  }

  function quitToMenu() {
    setPhase("menu");
    setResultText(null);
  }

  function getPlayer(playerId: string): TetrPlayerState {
    return gameRef.current.players.find((p) => p.id === playerId)!;
  }

  function actionsFor(playerId: string): TetrControlActions {
    return {
      moveLeft: () => {
        if (phaseRef.current !== "playing" || roundOverRef.current) return;
        tryMove(getPlayer(playerId), -1, 0);
      },
      moveRight: () => {
        if (phaseRef.current !== "playing" || roundOverRef.current) return;
        tryMove(getPlayer(playerId), 1, 0);
      },
      softDropStart: () => {
        if (phaseRef.current !== "playing" || roundOverRef.current) return;
        getPlayer(playerId).softDropping = true;
      },
      softDropEnd: () => {
        const p = gameRef.current.players.find((pl) => pl.id === playerId);
        if (p) p.softDropping = false;
      },
      hardDrop: () => {
        if (phaseRef.current !== "playing" || roundOverRef.current) return;
        hardDrop(gameRef.current, getPlayer(playerId));
      },
      rotateCw: () => {
        if (phaseRef.current !== "playing" || roundOverRef.current) return;
        rotate(getPlayer(playerId), 1);
      },
      rotateCcw: () => {
        if (phaseRef.current !== "playing" || roundOverRef.current) return;
        rotate(getPlayer(playerId), -1);
      },
      hold: () => {
        if (phaseRef.current !== "playing" || roundOverRef.current) return;
        holdPiece(getPlayer(playerId));
      },
      cycleTarget: () => {
        if (phaseRef.current !== "playing" || roundOverRef.current) return;
        cycleTarget(gameRef.current, getPlayer(playerId));
      },
    };
  }

  // Stable across re-renders (schemes only changes with `mode`) so the
  // keyboard-input effect doesn't tear down/rebuild its listeners every tick.
  const actionsByPlayerId = useMemo(() => {
    const map: Record<string, TetrControlActions> = {};
    for (const s of schemes) map[s.playerId] = actionsFor(s.playerId);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemes]);

  function startMode(next: GameMode) {
    const fresh = createTetrGame(next, settingsToGravityConfig(settings), settings.botCount, settings.botDifficulty);
    gameRef.current = fresh;
    roundOverRef.current = false;
    setMode(next);
    setGame(fresh);
    setResultText(null);
    setCountdown(COUNTDOWN_START);
    setPhase("countdown");
  }

  const humanPlayerIds = new Set(schemes.map((s) => s.playerId));
  const primaryBoard = game.players[0];
  const opponentBoards = game.players.slice(1);
  const humanTargetId = mode === "vsBot" ? primaryBoard?.targetId : null;
  const showTargeting = mode === "vsBot" && opponentBoards.length > 0;
  const canCycleTargets = mode === "vsBot" && opponentBoards.length > 1;
  const { containerRef, contentRef, scale } = useTetrFitScale<HTMLDivElement, HTMLDivElement>();

  return (
    <div className={styles.wrap} ref={containerRef}>
      {/* Boards render only outside the menu -- letterboxed (scaled, never
          stretched) to fit the fixed square via .gameStage/.fitStage. */}
      {phase !== "menu" && (
        <div className={styles.gameStage}>
          <div className={styles.fitStage} ref={contentRef} style={{ transform: `scale(${scale})` }}>
            <div className={styles.canvasWrap}>
              <div className={styles.boardsRow}>
                {primaryBoard && (
                  <TetrBoardPanel
                    board={primaryBoard}
                    boardWidth={BOARD_WIDTH}
                    boardHeight={BOARD_HEIGHT}
                    hiddenRows={BOARD_HIDDEN_ROWS}
                    pieceColors={pieceColors}
                    pieceStyle={pieceStyle}
                    name={displayName(mode, primaryBoard.id)}
                    scheme={schemes.find((s) => s.playerId === primaryBoard.id)}
                    actions={actionsByPlayerId[primaryBoard.id]}
                    enabled={phase === "playing" && humanPlayerIds.has(primaryBoard.id)}
                    showTouchControls={isMobile && mode !== "local2p"}
                    cellSize={mode === "local2p" ? LOCAL2P_CELL_SIZE : undefined}
                    showScore={mode === "solo"}
                    targetName={showTargeting && humanTargetId ? displayName(mode, humanTargetId) : undefined}
                    cycleTargetHint={canCycleTargets ? "C to switch" : undefined}
                    shakeEnabled={settings.screenShake}
                  />
                )}
                {opponentBoards.length > 0 && (
                  <div className={styles.opponentsGrid}>
                    {opponentBoards.map((b) => (
                      <TetrBoardPanel
                        key={b.id}
                        board={b}
                        boardWidth={BOARD_WIDTH}
                        boardHeight={BOARD_HEIGHT}
                        hiddenRows={BOARD_HIDDEN_ROWS}
                        pieceColors={pieceColors}
                        pieceStyle={pieceStyle}
                        name={displayName(mode, b.id)}
                        scheme={schemes.find((s) => s.playerId === b.id)}
                        actions={actionsByPlayerId[b.id]}
                        enabled={phase === "playing" && humanPlayerIds.has(b.id)}
                        isOpponent={mode !== "local2p"}
                        cellSize={mode === "local2p" ? LOCAL2P_CELL_SIZE : undefined}
                        targetName={mode === "vsBot" && b.targetId ? displayName(mode, b.targetId) : undefined}
                        isTargeted={showTargeting && b.id === humanTargetId}
                        shakeEnabled={settings.screenShake}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Rendered as a sibling of .fitStage (not inside it) so `inset: 0`
              covers the whole widget box -- .fitStage is sized/scaled to the
              boards' own content, which is smaller than the full square
              whenever the boards don't fill it edge to edge. */}
          {phase === "countdown" && (
            <div className={styles.overlay}>
              <div className={styles.countdownNum}>{countdown > 0 ? countdown : "Go!"}</div>
            </div>
          )}

          {phase === "paused" && (
            <div className={styles.overlay}>
              <div className={styles.pausePanel}>
                <h3 className={styles.pauseTitle}>Paused</h3>
                <div className={styles.pauseColumns}>
                  {schemes.map((s) => (
                    <div key={s.playerId} className={styles.pauseColumn}>
                      <div className={styles.pauseColumnHeader}>
                        <span className={styles.controlSwatch} style={{ background: s.color }} />
                        {s.label}
                      </div>
                      {pauseControlRows(s).map((row) => (
                        <div key={row.label} className={styles.pauseRow}>
                          <span className={styles.pauseRowLabel}>{row.label}</span>
                          <span className={styles.pauseRowKeys}>{row.keys}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className={styles.pauseActions}>
                  <button type="button" className={styles.pauseBtnPrimary} onClick={resumeGame}>
                    Resume
                  </button>
                  <button type="button" className={styles.pauseBtnSecondary} onClick={quitToMenu}>
                    Quit
                  </button>
                </div>
                <p className={styles.pauseHint}>Press Esc to resume</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* The menu fills the fixed square directly (see .menuScreen) instead
          of being measured/scaled like the boards -- it's UI chrome, not a
          game viewport, so it should fill the square rather than being
          letterboxed inside it. */}
      {phase === "menu" && menuView === "settings" && (
        <div className={styles.menuScreen}>
          <SettingsScreen settings={settings} onChange={updateSettings} onBack={() => setMenuView("modes")} />
        </div>
      )}
      {phase === "menu" && menuView === "modes" && (
        <div className={styles.menuScreen}>
          <button type="button" className={styles.cornerBtn} onClick={() => setMenuView("settings")} aria-label="Settings">
            <GearIcon />
          </button>
          <h2 className={styles.menuTitle}>{resultText ?? "Tetr Versus"}</h2>
          <p className={styles.menuSubtitle}>{resultText ? "Play again?" : "By Michael Mocioiu"}</p>
          <div className={styles.menu}>
            {modeOptions.map((opt) => (
              <button key={opt.mode} type="button" className={styles.menuBtn} onClick={() => startMode(opt.mode)}>
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

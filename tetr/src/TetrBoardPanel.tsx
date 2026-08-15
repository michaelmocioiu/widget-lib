import { useEffect, useRef } from "react";
import type { TetrPlayerState } from "./engine";
import type { PieceStyle } from "./pieces";
import { TetrAnimatedBoard } from "./TetrAnimatedBoard";
import { TetrHUD } from "./TetrHUD";
import { useTetrKeyboardInput, type TetrControlActions, type TetrControlScheme } from "./useTetrKeyboardInput";
import styles from "./Tetr.module.css";

const SWIPE_THRESHOLD = 24;
const FLICK_MAX_MS = 220;

const EMPTY_SCHEME: TetrControlScheme = {
  playerId: "__none__",
  label: "",
  color: "#888",
  keysLabel: "",
  left: [],
  right: [],
  softDrop: [],
  hardDrop: [],
  rotateCw: [],
  rotateCcw: [],
  hold: [],
  cycleTarget: [],
};
const NOOP_ACTIONS: TetrControlActions = {
  moveLeft: () => {},
  moveRight: () => {},
  softDropStart: () => {},
  softDropEnd: () => {},
  hardDrop: () => {},
  rotateCw: () => {},
  rotateCcw: () => {},
  hold: () => {},
  cycleTarget: () => {},
};

// Boards render at native resolution then get scaled to fit by
// .boardCanvas's max-width/max-height -- these are the sizes that fill a
// typical desktop window without ever needing to grow past native size.
const SELF_CELL_SIZE = 30;
const OPPONENT_CELL_SIZE = 12;

interface TetrBoardPanelProps {
  board: TetrPlayerState;
  boardWidth: number;
  boardHeight: number;
  hiddenRows: number;
  pieceColors: Record<string, string>;
  name: string;
  scheme?: TetrControlScheme;
  actions?: TetrControlActions;
  enabled?: boolean;
  showTouchControls?: boolean;
  isOpponent?: boolean;
  cellSize?: number;
  targetName?: string;
  isTargeted?: boolean;
  pieceStyle?: PieceStyle;
  showScore?: boolean;
  cycleTargetHint?: string;
  shakeEnabled?: boolean;
}

export function TetrBoardPanel({
  board,
  boardWidth,
  boardHeight,
  hiddenRows,
  pieceColors,
  name,
  scheme,
  actions,
  enabled = false,
  showTouchControls = false,
  isOpponent = false,
  cellSize,
  targetName,
  isTargeted = false,
  pieceStyle,
  showScore = false,
  cycleTargetHint,
  shakeEnabled = true,
}: TetrBoardPanelProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const softDroppingRef = useRef(false);
  const dragXRef = useRef(0);
  const dragCellPxRef = useRef(20);
  const lastHoldAtRef = useRef(0);

  const canAct = enabled && board.alive;

  // Hooks can't be called conditionally, so always call this with a fallback
  // no-op scheme/actions for boards with no human input (e.g. the bot's own
  // board) and gate it off entirely via `enabled`.
  useTetrKeyboardInput(
    scheme ?? EMPTY_SCHEME,
    actions ?? NOOP_ACTIONS,
    canAct && !!scheme && !!actions,
  );

  useEffect(() => {
    if (!showTouchControls || !actions || !canAct) return;
    const el = wrapRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      softDroppingRef.current = false;
      dragXRef.current = t.clientX;
      const canvas = el.querySelector("canvas");
      dragCellPxRef.current = canvas ? canvas.getBoundingClientRect().width / boardWidth : 20;
    };
    const onTouchMove = (e: TouchEvent) => {
      const start = touchStartRef.current;
      if (!start) return;
      e.preventDefault();
      const t = e.touches[0];
      const dy = t.clientY - start.y;
      if (!softDroppingRef.current && dy > SWIPE_THRESHOLD) {
        softDroppingRef.current = true;
        actions.softDropStart();
      }
      if (softDroppingRef.current) return;

      const cellPx = dragCellPxRef.current;
      const dx = t.clientX - dragXRef.current;
      const steps = Math.trunc(dx / cellPx);
      if (steps !== 0) {
        for (let i = 0; i < Math.abs(steps); i++) {
          if (steps > 0) actions.moveRight();
          else actions.moveLeft();
        }
        dragXRef.current += steps * cellPx;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (softDroppingRef.current) {
        softDroppingRef.current = false;
        actions.softDropEnd();
      }
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const duration = Date.now() - start.t;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (Math.max(absDx, absDy) < SWIPE_THRESHOLD) {
        actions.rotateCw();
        return;
      }
      if (absDy > absDx && dy < 0) {
        actions.hardDrop();
        return;
      }
      if (absDy > absDx && duration < FLICK_MAX_MS && absDy > SWIPE_THRESHOLD * 2) {
        actions.hardDrop();
      }
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
  }, [showTouchControls, canAct, boardWidth]);

  const onHold = () => {
    lastHoldAtRef.current = Date.now();
    actions?.hold();
  };

  return (
    <div
      className={`${styles.boardColumn} ${isOpponent ? styles.boardColumnOpponent : ""} ${isTargeted ? styles.boardColumnTargeted : ""}`}
      ref={wrapRef}
    >
      {isOpponent && (
        <div className={`${styles.boardName} ${isTargeted ? styles.boardNameTargeted : ""}`}>
          {name}
          {targetName && <span className={styles.boardNameTarget}> → {targetName}</span>}
        </div>
      )}
      {!isOpponent && targetName && (
        <div className={styles.selfTargetLabel}>
          Targeting: {targetName}
          {cycleTargetHint && <span className={styles.targetHint}> ({cycleTargetHint})</span>}
        </div>
      )}
      <TetrAnimatedBoard
        board={board}
        boardWidth={boardWidth}
        boardHeight={boardHeight}
        hiddenRows={hiddenRows}
        pieceColors={pieceColors}
        cellSize={cellSize ?? (isOpponent ? OPPONENT_CELL_SIZE : SELF_CELL_SIZE)}
        showGhost={!isOpponent}
        dim={isOpponent && !board.alive}
        suppressLockRef={lastHoldAtRef}
        pieceStyle={pieceStyle}
        shakeEnabled={!isOpponent && shakeEnabled}
      />
      {!isOpponent && <TetrHUD board={board} pieceColors={pieceColors} showScore={showScore} />}
      {showTouchControls && actions && canAct && (
        <div className={styles.controls}>
          <button type="button" className={styles.ctrlBtn} onPointerDown={actions.moveLeft} aria-label="Left">◀</button>
          <button type="button" className={styles.ctrlBtn} onPointerDown={actions.rotateCw} aria-label="Rotate">⟳</button>
          <button type="button" className={styles.ctrlBtn} onPointerDown={actions.moveRight} aria-label="Right">▶</button>
          <button type="button" className={`${styles.ctrlBtn} ${styles.holdBtn}`} onPointerDown={onHold} aria-label="Hold">Hold</button>
          <button type="button" className={styles.ctrlBtn} onPointerDown={actions.hardDrop} aria-label="Hard drop">⤓</button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { TetrPlayerState } from "./engine";

export type TetrPopupVariant = "single" | "double" | "triple" | "tetris" | "combo" | "b2b";

export interface TetrPopup {
  id: number;
  text: string;
  variant: TetrPopupVariant;
}

interface TetrEffectState {
  flashToken: number;
  shakeToken: number;
  popups: TetrPopup[];
}

let popupCounter = 0;

const CLEAR_TEXT: Record<"single" | "double" | "triple" | "tetris", string> = {
  single: "Single",
  double: "Double",
  triple: "Triple",
  tetris: "TETRIS!",
};

const POPUP_LIFETIME_MS = 1100;

// A piece always spawns at y === SPAWN_Y (see engine.ts), on both a real lock
// and a hold swap, and only ever moves down between spawns -- so "current.y
// is SPAWN_Y this tick, and wasn't already SPAWN_Y last tick" is an exact
// signal that the previous piece locked/was swapped and a new one spawned.
const SPAWN_Y = 1;
// Suppresses a spurious lock-shake right after a hold swap resets `current`
// the same way a lock+spawn would.
const LOCK_SUPPRESS_AFTER_HOLD_MS = 200;

// Tick state is a full snapshot, not a diff, so every discrete visual event
// below (line clear / combo / B2B / lock) is detected by comparing this
// tick's board against the previous tick's.
export function useTetrBoardEffects(
  board: TetrPlayerState | undefined,
  suppressLockRef?: RefObject<number>,
): TetrEffectState {
  const prevRef = useRef<{
    linesClearedTotal: number;
    comboCount: number;
    b2b: boolean;
    current: TetrPlayerState["current"];
    alive: boolean;
  } | null>(null);
  const [state, setState] = useState<TetrEffectState>({ flashToken: 0, shakeToken: 0, popups: [] });

  useEffect(() => {
    if (!board) return;
    const prev = prevRef.current;
    prevRef.current = {
      linesClearedTotal: board.linesClearedTotal,
      comboCount: board.comboCount,
      b2b: board.b2b,
      current: board.current,
      alive: board.alive,
    };
    if (!prev) return;

    const delta = board.linesClearedTotal - prev.linesClearedTotal;
    const lockJump =
      !!prev.current &&
      !!board.current &&
      board.current.y === SPAWN_Y &&
      prev.current.y !== SPAWN_Y &&
      Date.now() - (suppressLockRef?.current ?? 0) > LOCK_SUPPRESS_AFTER_HOLD_MS;

    if (lockJump) {
      setState((s) => ({ ...s, shakeToken: s.shakeToken + 1 }));
    }

    if (delta <= 0) return;

    const newPopups: TetrPopup[] = [];
    const clearKind = delta >= 4 ? "tetris" : delta === 3 ? "triple" : delta === 2 ? "double" : "single";
    newPopups.push({ id: popupCounter++, text: CLEAR_TEXT[clearKind], variant: clearKind });
    if (Math.max(board.comboCount, 0) >= 2) {
      newPopups.push({ id: popupCounter++, text: `Combo x${board.comboCount}`, variant: "combo" });
    }
    if (board.b2b) {
      newPopups.push({ id: popupCounter++, text: "B2B", variant: "b2b" });
    }

    setState((s) => ({ ...s, flashToken: s.flashToken + 1, popups: [...s.popups, ...newPopups] }));
    newPopups.forEach((p) => {
      setTimeout(() => {
        setState((s) => ({ ...s, popups: s.popups.filter((x) => x.id !== p.id) }));
      }, POPUP_LIFETIME_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, board?.linesClearedTotal, board?.comboCount, board?.b2b, board?.alive]);

  return state;
}

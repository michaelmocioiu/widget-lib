import { useEffect, useRef } from "react";
import { DAS_MS, ARR_MS } from "./engine";

// One entry per human-controlled board. Each direction/action lists every
// keyboard key that triggers it -- solo/vsBot accept both the WASD and
// arrow-key clusters at once (so either hand works), while local2p splits
// them into two non-overlapping sets, one per player, so two boards can
// share one keyboard with no cross-talk.
export interface TetrControlScheme {
  playerId: string;
  label: string;
  color: string;
  keysLabel: string;
  left: string[];
  right: string[];
  softDrop: string[];
  hardDrop: string[];
  rotateCw: string[];
  rotateCcw: string[];
  hold: string[];
  cycleTarget: string[];
}

export interface TetrControlActions {
  moveLeft: () => void;
  moveRight: () => void;
  softDropStart: () => void;
  softDropEnd: () => void;
  hardDrop: () => void;
  rotateCw: () => void;
  rotateCcw: () => void;
  hold: () => void;
  cycleTarget: () => void;
}

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

// "ShiftLeft"/"ShiftRight" aren't real `key` values (e.key is just "Shift"
// for both) -- they're matched against `e.code` instead, which is how left
// and right modifier keys are told apart.
function matches(list: string[], e: KeyboardEvent): boolean {
  const nk = normalizeKey(e.key);
  return list.some((k) => (k === "ShiftLeft" || k === "ShiftRight" ? k === e.code : normalizeKey(k) === nk));
}

export function useTetrKeyboardInput(
  scheme: TetrControlScheme,
  actions: TetrControlActions,
  enabled: boolean,
) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    if (!enabled) return;
    let dasTimer: ReturnType<typeof setTimeout> | null = null;
    let arrTimer: ReturnType<typeof setInterval> | null = null;
    const heldDirections = new Set<"left" | "right">();

    const clearHorizontalRepeat = () => {
      if (dasTimer) clearTimeout(dasTimer);
      if (arrTimer) clearInterval(arrTimer);
      dasTimer = null;
      arrTimer = null;
    };
    const startHorizontalRepeat = (fn: () => void) => {
      fn();
      clearHorizontalRepeat();
      dasTimer = setTimeout(() => {
        arrTimer = setInterval(fn, ARR_MS);
      }, DAS_MS);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (matches(scheme.left, e)) {
        e.preventDefault();
        if (e.repeat) return;
        heldDirections.add("left");
        startHorizontalRepeat(() => actionsRef.current.moveLeft());
      } else if (matches(scheme.right, e)) {
        e.preventDefault();
        if (e.repeat) return;
        heldDirections.add("right");
        startHorizontalRepeat(() => actionsRef.current.moveRight());
      } else if (matches(scheme.softDrop, e)) {
        e.preventDefault();
        if (!e.repeat) actionsRef.current.softDropStart();
      } else if (matches(scheme.hardDrop, e)) {
        e.preventDefault();
        if (e.repeat) return;
        actionsRef.current.hardDrop();
      } else if (matches(scheme.rotateCw, e)) {
        e.preventDefault();
        if (e.repeat) return;
        actionsRef.current.rotateCw();
      } else if (matches(scheme.rotateCcw, e)) {
        e.preventDefault();
        if (e.repeat) return;
        actionsRef.current.rotateCcw();
      } else if (matches(scheme.hold, e)) {
        e.preventDefault();
        if (e.repeat) return;
        actionsRef.current.hold();
      } else if (matches(scheme.cycleTarget, e)) {
        e.preventDefault();
        if (e.repeat) return;
        actionsRef.current.cycleTarget();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (matches(scheme.left, e)) {
        heldDirections.delete("left");
        if (!heldDirections.has("right")) clearHorizontalRepeat();
      } else if (matches(scheme.right, e)) {
        heldDirections.delete("right");
        if (!heldDirections.has("left")) clearHorizontalRepeat();
      } else if (matches(scheme.softDrop, e)) {
        actionsRef.current.softDropEnd();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      clearHorizontalRepeat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme, enabled]);
}

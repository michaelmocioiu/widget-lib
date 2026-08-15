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
}

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

function matches(list: string[], key: string): boolean {
  const nk = normalizeKey(key);
  return list.some((k) => normalizeKey(k) === nk);
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
      const key = e.key;
      if (matches(scheme.left, key)) {
        e.preventDefault();
        if (e.repeat) return;
        heldDirections.add("left");
        startHorizontalRepeat(() => actionsRef.current.moveLeft());
      } else if (matches(scheme.right, key)) {
        e.preventDefault();
        if (e.repeat) return;
        heldDirections.add("right");
        startHorizontalRepeat(() => actionsRef.current.moveRight());
      } else if (matches(scheme.softDrop, key)) {
        e.preventDefault();
        if (!e.repeat) actionsRef.current.softDropStart();
      } else if (matches(scheme.hardDrop, key)) {
        e.preventDefault();
        if (e.repeat) return;
        actionsRef.current.hardDrop();
      } else if (matches(scheme.rotateCw, key)) {
        e.preventDefault();
        if (e.repeat) return;
        actionsRef.current.rotateCw();
      } else if (matches(scheme.rotateCcw, key)) {
        e.preventDefault();
        if (e.repeat) return;
        actionsRef.current.rotateCcw();
      } else if (matches(scheme.hold, key)) {
        e.preventDefault();
        if (e.repeat) return;
        actionsRef.current.hold();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key;
      if (matches(scheme.left, key)) {
        heldDirections.delete("left");
        if (!heldDirections.has("right")) clearHorizontalRepeat();
      } else if (matches(scheme.right, key)) {
        heldDirections.delete("right");
        if (!heldDirections.has("left")) clearHorizontalRepeat();
      } else if (matches(scheme.softDrop, key)) {
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

import { useCallback, useRef, useState } from "react";

// Keeps the widget's outer footprint fixed (set purely by CSS on the
// container) while the game content -- which varies wildly in natural size
// across modes/menus/bot-count (a tall solo board vs. a wide multi-bot vsBot
// row vs. the menu) -- scales uniformly to fit inside it, like CSS
// `object-fit: contain` but for an arbitrary DOM subtree via a transform.
//
// The content node (.fitStage) only exists in the DOM while a game is
// showing -- it unmounts whenever the menu is up (the app's default phase),
// then remounts on the next mode start. A plain `useEffect(..., [])` would
// only ever see it if it happened to exist on the very first render, so
// this uses callback refs instead: every mount/unmount of either node
// re-attaches the observer and recomputes immediately.
export function useTetrFitScale<
  C extends HTMLElement = HTMLDivElement,
  I extends HTMLElement = HTMLDivElement,
>() {
  const containerElRef = useRef<C | null>(null);
  const contentElRef = useRef<I | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [scale, setScale] = useState(1);

  const recompute = useRef(() => {
    const container = containerElRef.current;
    const content = contentElRef.current;
    if (!container || !content) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    // offsetWidth/Height report the content's own (untransformed) layout
    // box, so this is safe to read even while a `transform: scale(...)` is
    // applied to this same element -- transforms don't affect layout.
    const iw = content.offsetWidth;
    const ih = content.offsetHeight;
    if (!cw || !ch || !iw || !ih) return;
    // Clamp defensively -- a transient 0/near-0 content measurement (e.g.
    // mid-layout during a mode switch) would otherwise scale the game down
    // to an invisible point instead of just leaving it oversized for one
    // frame.
    const next = Math.min(cw / iw, ch / ih);
    setScale(Number.isFinite(next) && next > 0 ? next : 1);
  }).current;

  const resetObserver = useCallback(() => {
    roRef.current?.disconnect();
    roRef.current = null;
    const container = containerElRef.current;
    const content = contentElRef.current;
    if (!container || !content) return;
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    ro.observe(content);
    roRef.current = ro;
    recompute();
  }, [recompute]);

  const containerRef = useCallback(
    (node: C | null) => {
      containerElRef.current = node;
      resetObserver();
    },
    [resetObserver],
  );

  const contentRef = useCallback(
    (node: I | null) => {
      contentElRef.current = node;
      resetObserver();
    },
    [resetObserver],
  );

  return { containerRef, contentRef, scale };
}

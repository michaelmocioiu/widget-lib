// Trimmed down to only the
// pieces snakeCanvas.ts actually needs (lerpCell + lerpChainEnds). The full
// file's createTickClock/snapshot-buffer machinery is for reconciling
// against a real server tick source, which a local single-process loop
// doesn't need.
import type { GridCell } from "./types";

export function lerpCell(prev: GridCell, curr: GridCell, t: number, maxStep = 1.5): GridCell {
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  if (Math.abs(dx) > maxStep || Math.abs(dy) > maxStep) return curr;
  return { x: prev.x + dx * t, y: prev.y + dy * t };
}

// Only the head/tail actually move between ticks -- see the original
// header comment on why interpolating every index independently makes
// corners visibly rotate during the glide.
export function lerpChainEnds<T extends GridCell>(prevBody: T[], currBody: T[], t: number): T[] {
  if (prevBody.length === 0 || currBody.length === 0) return currBody;

  const head = { ...currBody[0], ...lerpCell(prevBody[0], currBody[0], t) };
  if (currBody.length === 1) return [head];

  const grew = prevBody.length !== currBody.length;
  const isOrganicAdvance =
    !grew && currBody.length > 1 && currBody[1].x === prevBody[0].x && currBody[1].y === prevBody[0].y;

  if (grew || !isOrganicAdvance) {
    return currBody.map((c, i) => {
      if (i === 0) return head;
      const isTail = i === currBody.length - 1;
      if (isTail && !grew) return { ...c, ...lerpCell(prevBody[prevBody.length - 1], c, t) };
      return c;
    });
  }

  const interior = currBody.slice(1, currBody.length - 1);
  const tailAnchor = prevBody[prevBody.length - 2];
  const tailTip = {
    ...currBody[currBody.length - 1],
    ...lerpCell(prevBody[prevBody.length - 1], tailAnchor ?? currBody[currBody.length - 1], t),
  };
  return [head, ...interior, tailAnchor ?? currBody[currBody.length - 1], tailTip];
}

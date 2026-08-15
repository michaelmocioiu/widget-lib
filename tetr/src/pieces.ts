// Piece cell offsets per rotation state, in a uniform 4x4 bounding box, plus
// their default render colors. Shared by both the simulation (engine.ts) and
// the canvas renderer so the two never drift out of sync.
import type { PieceType } from "./types";

export const PIECE_TYPES: PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

export const PIECE_SHAPES: Record<PieceType, [number, number][][]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

export const GARBAGE_COLOR = "#6b6f76";

export interface ColorPalette {
  id: string;
  label: string;
  colors: Record<PieceType, string>;
}

export const COLOR_PALETTES: ColorPalette[] = [
  {
    id: "classic",
    label: "Classic",
    colors: { I: "#31C7EF", O: "#F7D308", T: "#AD4D9C", S: "#42B642", Z: "#EF2029", J: "#2141C6", L: "#E97826" },
  },
  {
    id: "pastel",
    label: "Pastel",
    colors: { I: "#7FE8E0", O: "#F6E27A", T: "#C99BE0", S: "#9BE0A8", Z: "#F09A9A", J: "#8FA8F0", L: "#F0BE8F" },
  },
  {
    id: "neon",
    label: "Neon",
    colors: { I: "#00F0FF", O: "#FFF000", T: "#FF00E5", S: "#00FF6A", Z: "#FF2D2D", J: "#3D5CFF", L: "#FF8A00" },
  },
];

export function paletteById(id: string): ColorPalette {
  return COLOR_PALETTES.find((p) => p.id === id) ?? COLOR_PALETTES[0];
}

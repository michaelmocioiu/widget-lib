// Piece cell offsets per rotation state, in a uniform 4x4 bounding box, plus
// their default render colors. Shared by both the simulation (engine.ts) and
// the canvas renderer so the two never drift out of sync.
import type { PieceType } from "./types";
import type { PieceFinish } from "./outline";

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
  {
    id: "sunset",
    label: "Sunset",
    colors: { I: "#4CC9F0", O: "#FFD166", T: "#EF476F", S: "#FFA552", Z: "#D62828", J: "#7B2CBF", L: "#F77F00" },
  },
  {
    id: "ocean",
    label: "Ocean",
    colors: { I: "#48CAE4", O: "#90E0EF", T: "#0096C7", S: "#00B4D8", Z: "#023E8A", J: "#03045E", L: "#0077B6" },
  },
  {
    id: "mono",
    label: "Mono",
    colors: { I: "#E5E5E5", O: "#BFBFBF", T: "#999999", S: "#D4D4D4", Z: "#737373", J: "#525252", L: "#8C8C8C" },
  },
];

export function paletteById(id: string): ColorPalette {
  return COLOR_PALETTES.find((p) => p.id === id) ?? COLOR_PALETTES[0];
}

// Alternate block-rendering designs -- radiusFactor/gapWidth feed
// TetrBoardCanvas's corner-rounding and inter-block gap, `finish` picks the
// fill/decoration treatment (see paintStyledShape in outline.ts), shared by
// real gameplay rendering and the settings/menu preview swatches.
export interface PieceStyle {
  id: string;
  label: string;
  radiusFactor: number;
  gapWidth: number;
  finish: PieceFinish;
}

export const PIECE_STYLES: PieceStyle[] = [
  { id: "rounded", label: "Rounded", radiusFactor: 0.22, gapWidth: 1.5, finish: "flat" },
  { id: "sharp", label: "Sharp", radiusFactor: 0.04, gapWidth: 1, finish: "flat" },
  { id: "retro", label: "Retro", radiusFactor: 0.05, gapWidth: 1, finish: "bevel" },
  { id: "glass", label: "Glass", radiusFactor: 0.26, gapWidth: 1.5, finish: "glass" },
  { id: "neon", label: "Neon", radiusFactor: 0.16, gapWidth: 2, finish: "neon" },
  { id: "gem", label: "Gem", radiusFactor: 0.18, gapWidth: 1.5, finish: "gem" },
];

export function pieceStyleById(id: string): PieceStyle {
  return PIECE_STYLES.find((s) => s.id === id) ?? PIECE_STYLES[0];
}

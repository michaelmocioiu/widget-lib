// User-configurable rules and appearance, editable from the in-widget
// settings screen and persisted to localStorage so choices survive a reload.
import type { SnakeGameConfig } from "./engine";

export type FaceStyle = "classic" | "sleepy" | "angry";

export interface PlayerAppearance {
  color: string;
  face: FaceStyle;
}

export interface SnakeSettings {
  segmentsPerDot: number;
  foodCount: number;
  edgeWrapping: boolean;
  p1: PlayerAppearance;
  p2: PlayerAppearance;
  boardThemeId: string;
}

export interface ColorSwatch {
  id: string;
  color: string;
}

export const COLOR_SWATCHES: ColorSwatch[] = [
  { id: "sky", color: "#38bdf8" },
  { id: "red", color: "#f50b0b" },
  { id: "amber", color: "#facc15" },
  { id: "violet", color: "#a855f7" },
  { id: "green", color: "#22c55e" },
  { id: "orange", color: "#f97316" },
];

export interface FaceOption {
  id: FaceStyle;
  label: string;
}

export const FACE_OPTIONS: FaceOption[] = [
  { id: "classic", label: "Classic" },
  { id: "sleepy", label: "Sleepy" },
  { id: "angry", label: "Angry" },
];

export interface BoardTheme {
  id: string;
  label: string;
  light: string;
  dark: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: "forest", label: "Forest", light: "hsl(114, 34%, 38%)", dark: "rgb(52, 96, 47)" },
  { id: "ocean", label: "Ocean", light: "hsl(199, 60%, 42%)", dark: "rgb(19, 62, 90)" },
  { id: "sunset", label: "Sunset", light: "hsl(14, 70%, 52%)", dark: "rgb(120, 45, 40)" },
  { id: "slate", label: "Slate", light: "hsl(220, 12%, 42%)", dark: "rgb(46, 50, 58)" },
];

export const DEFAULT_SETTINGS: SnakeSettings = {
  segmentsPerDot: 3,
  foodCount: 2,
  edgeWrapping: true,
  p1: { color: COLOR_SWATCHES[0].color, face: "classic" },
  p2: { color: COLOR_SWATCHES[1].color, face: "classic" },
  boardThemeId: BOARD_THEMES[0].id,
};

const STORAGE_KEY = "snake-duel-settings";

export function loadSettings(): SnakeSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed, p1: { ...DEFAULT_SETTINGS.p1, ...parsed.p1 }, p2: { ...DEFAULT_SETTINGS.p2, ...parsed.p2 } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: SnakeSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode, quota) -- settings just won't persist.
  }
}

export function boardThemeById(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}

export function settingsToGameConfig(settings: SnakeSettings): SnakeGameConfig {
  return {
    segmentsPerDot: settings.segmentsPerDot,
    foodCount: settings.foodCount,
    edgeWrapping: settings.edgeWrapping,
  };
}

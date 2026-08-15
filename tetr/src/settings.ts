// User-configurable rules and appearance, editable from the in-widget
// settings screen and persisted to localStorage so choices survive a reload.
import { COLOR_PALETTES, paletteById } from "./pieces";
import { gravityConfigForSpeed, type GravityConfig } from "./engine";

export type GameSpeed = "slow" | "normal" | "fast" | "insane";

export interface SpeedOption {
  id: GameSpeed;
  label: string;
  multiplier: number;
}

export const SPEED_OPTIONS: SpeedOption[] = [
  { id: "slow", label: "Slow", multiplier: 0.7 },
  { id: "normal", label: "Normal", multiplier: 1 },
  { id: "fast", label: "Fast", multiplier: 1.4 },
  { id: "insane", label: "Insane", multiplier: 2 },
];

export interface TetrSettings {
  speed: GameSpeed;
  paletteId: string;
}

export const DEFAULT_SETTINGS: TetrSettings = {
  speed: "normal",
  paletteId: COLOR_PALETTES[0].id,
};

const STORAGE_KEY = "tetr-versus-settings";

export function loadSettings(): TetrSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: TetrSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode, quota) -- settings just won't persist.
  }
}

export function speedOptionById(id: GameSpeed): SpeedOption {
  return SPEED_OPTIONS.find((s) => s.id === id) ?? SPEED_OPTIONS[1];
}

export function settingsToGravityConfig(settings: TetrSettings): GravityConfig {
  return gravityConfigForSpeed(speedOptionById(settings.speed).multiplier);
}

export function settingsToColors(settings: TetrSettings) {
  return paletteById(settings.paletteId).colors;
}

export { COLOR_PALETTES };

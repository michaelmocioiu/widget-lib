import { useEffect, useRef, type CSSProperties } from "react";
import { BOARD_THEMES, COLOR_SWATCHES, FACE_OPTIONS, SPEED_OPTIONS } from "./settings";
import type { SnakeSettings, PlayerAppearance, FaceStyle } from "./settings";
import { drawSnakePreview, SNAKE_PREVIEW_LENGTH, SNAKE_PREVIEW_CELL_SIZE } from "./snakeCanvas";
import styles from "./Snake.module.css";

function SnakePreview({ color, face }: { color: string; face: FaceStyle }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawSnakePreview(canvas, color, face);
  }, [color, face]);
  return (
    <canvas
      ref={canvasRef}
      width={SNAKE_PREVIEW_LENGTH * SNAKE_PREVIEW_CELL_SIZE}
      height={SNAKE_PREVIEW_CELL_SIZE * 1.6}
      className={styles.previewCanvas}
    />
  );
}

// 2x2 checkerboard preview swatch for a board theme, built purely from CSS
// (no canvas needed) -- two opposing corners in each color.
function checkeredTileStyle(light: string, dark: string): CSSProperties {
  return {
    backgroundImage: `linear-gradient(to right, ${dark} 50%, ${light} 50%), linear-gradient(to right, ${light} 50%, ${dark} 50%)`,
    backgroundSize: "100% 50%",
    backgroundPosition: "top, bottom",
    backgroundRepeat: "no-repeat",
  };
}

const MIN_STAT = 1;
const MAX_STAT = 5;

export interface SettingsScreenProps {
  settings: SnakeSettings;
  onChange: (next: SnakeSettings) => void;
  onBack: () => void;
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className={styles.settingsRow}>
      <span className={styles.settingsLabel}>{label}</span>
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.stepperBtn}
          onClick={() => onChange(Math.max(MIN_STAT, value - 1))}
          disabled={value <= MIN_STAT}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <span className={styles.stepperValue}>{value}</span>
        <button
          type="button"
          className={styles.stepperBtn}
          onClick={() => onChange(Math.min(MAX_STAT, value + 1))}
          disabled={value >= MAX_STAT}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

function PlayerColumn({
  label,
  appearance,
  otherColor,
  onChange,
}: {
  label: string;
  appearance: PlayerAppearance;
  otherColor: string;
  onChange: (next: PlayerAppearance) => void;
}) {
  return (
    <div className={styles.playerColumn}>
      <div className={styles.playerColumnLabel}>{label}</div>
      <div className={styles.swatchRow}>
        {COLOR_SWATCHES.map((sw) => {
          const takenByOther = sw.color === otherColor;
          return (
            <button
              key={sw.id}
              type="button"
              className={`${styles.swatchBtn} ${appearance.color === sw.color ? styles.swatchBtnActive : ""}`}
              style={{ background: sw.color, opacity: takenByOther ? 0.3 : 1 }}
              aria-label={sw.id}
              aria-pressed={appearance.color === sw.color}
              disabled={takenByOther}
              onClick={() => onChange({ ...appearance, color: sw.color })}
            />
          );
        })}
      </div>
      <div className={styles.faceRow}>
        {FACE_OPTIONS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${styles.faceBtn} ${appearance.face === f.id ? styles.faceBtnActive : ""}`}
            aria-pressed={appearance.face === f.id}
            onClick={() => onChange({ ...appearance, face: f.id })}
          >
            {f.label}
          </button>
        ))}
      </div>
      <SnakePreview color={appearance.color} face={appearance.face} />
    </div>
  );
}

export function SettingsScreen({ settings, onChange, onBack }: SettingsScreenProps) {
  return (
    <div className={styles.settingsScreen}>
      <button type="button" className={styles.cornerBtn} onClick={onBack} aria-label="Back">
        <BackIcon />
      </button>
      <h2 className={styles.menuTitle}>Settings</h2>
      <div className={styles.settingsBody}>
        <section className={styles.settingsSection}>
          <h3 className={styles.settingsSectionTitle}>Game settings</h3>
          <Stepper
            label="Length per pellet"
            value={settings.segmentsPerDot}
            onChange={(v) => onChange({ ...settings, segmentsPerDot: v })}
          />
          <Stepper
            label="Number of pellets"
            value={settings.foodCount}
            onChange={(v) => onChange({ ...settings, foodCount: v })}
          />
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Game speed</span>
            <div className={styles.faceRow}>
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`${styles.faceBtn} ${settings.speed === opt.id ? styles.faceBtnActive : ""}`}
                  aria-pressed={settings.speed === opt.id}
                  onClick={() => onChange({ ...settings, speed: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Edge wrapping</span>
            <button
              type="button"
              className={`${styles.toggleBtn} ${settings.edgeWrapping ? styles.toggleBtnOn : ""}`}
              aria-pressed={settings.edgeWrapping}
              onClick={() => onChange({ ...settings, edgeWrapping: !settings.edgeWrapping })}
            >
              <span className={styles.toggleThumb} />
            </button>
          </div>
        </section>

        <section className={styles.settingsSection}>
          <h3 className={styles.settingsSectionTitle}>Player settings</h3>
          <div className={styles.playerColumns}>
            <PlayerColumn
              label="Player 1"
              appearance={settings.p1}
              otherColor={settings.p2.color}
              onChange={(p1) => onChange({ ...settings, p1 })}
            />
            <PlayerColumn
              label="Player 2"
              appearance={settings.p2}
              otherColor={settings.p1.color}
              onChange={(p2) => onChange({ ...settings, p2 })}
            />
          </div>
        </section>

        <section className={styles.settingsSection}>
          <h3 className={styles.settingsSectionTitle}>Board colors</h3>
          <div className={styles.themeRow}>
            {BOARD_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={`${styles.themeBtn} ${settings.boardThemeId === theme.id ? styles.themeBtnActive : ""}`}
                aria-pressed={settings.boardThemeId === theme.id}
                onClick={() => onChange({ ...settings, boardThemeId: theme.id })}
              >
                <span className={styles.themeTile} style={checkeredTileStyle(theme.light, theme.dark)} />
                <span className={styles.themeLabel}>{theme.label}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

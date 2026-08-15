import {
  BOT_COUNT_OPTIONS,
  BOT_DIFFICULTY_OPTIONS,
  COLOR_PALETTES,
  PIECE_STYLES,
  SPEED_OPTIONS,
  type TetrSettings,
} from "./settings";
import styles from "./Tetr.module.css";

export interface SettingsScreenProps {
  settings: TetrSettings;
  onChange: (next: TetrSettings) => void;
  onBack: () => void;
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
            <span className={styles.settingsLabel}>Bots (vs AI)</span>
            <div className={styles.faceRow}>
              {BOT_COUNT_OPTIONS.map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`${styles.faceBtn} ${settings.botCount === count ? styles.faceBtnActive : ""}`}
                  aria-pressed={settings.botCount === count}
                  onClick={() => onChange({ ...settings, botCount: count })}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Bot difficulty</span>
            <div className={styles.faceRow}>
              {BOT_DIFFICULTY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`${styles.faceBtn} ${settings.botDifficulty === opt.id ? styles.faceBtnActive : ""}`}
                  aria-pressed={settings.botDifficulty === opt.id}
                  onClick={() => onChange({ ...settings, botDifficulty: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Screen shake</span>
            <div className={styles.faceRow}>
              <button
                type="button"
                className={`${styles.faceBtn} ${settings.screenShake ? styles.faceBtnActive : ""}`}
                aria-pressed={settings.screenShake}
                onClick={() => onChange({ ...settings, screenShake: true })}
              >
                On
              </button>
              <button
                type="button"
                className={`${styles.faceBtn} ${!settings.screenShake ? styles.faceBtnActive : ""}`}
                aria-pressed={!settings.screenShake}
                onClick={() => onChange({ ...settings, screenShake: false })}
              >
                Off
              </button>
            </div>
          </div>
        </section>

        <section className={styles.settingsSection}>
          <h3 className={styles.settingsSectionTitle}>Block colors</h3>
          <div className={styles.themeRow}>
            {COLOR_PALETTES.map((palette) => (
              <button
                key={palette.id}
                type="button"
                className={`${styles.themeBtn} ${settings.paletteId === palette.id ? styles.themeBtnActive : ""}`}
                aria-pressed={settings.paletteId === palette.id}
                onClick={() => onChange({ ...settings, paletteId: palette.id })}
              >
                <span className={styles.paletteSwatches}>
                  {Object.values(palette.colors).map((color, i) => (
                    <span key={i} className={styles.paletteSwatch} style={{ background: color }} />
                  ))}
                </span>
                <span className={styles.themeLabel}>{palette.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.settingsSection}>
          <h3 className={styles.settingsSectionTitle}>Piece design</h3>
          <div className={styles.themeRow}>
            {PIECE_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                className={`${styles.themeBtn} ${settings.pieceStyleId === style.id ? styles.themeBtnActive : ""}`}
                aria-pressed={settings.pieceStyleId === style.id}
                onClick={() => onChange({ ...settings, pieceStyleId: style.id })}
              >
                <span
                  className={styles.pieceStylePreview}
                  style={{
                    borderRadius: `${Math.round(style.radiusFactor * 40)}px`,
                    background: style.bevel
                      ? "linear-gradient(135deg, #5fe0d6, #1f7c76)"
                      : "#31C7EF",
                  }}
                />
                <span className={styles.themeLabel}>{style.label}</span>
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

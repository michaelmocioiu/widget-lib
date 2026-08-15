import { COLOR_PALETTES, SPEED_OPTIONS, type TetrSettings } from "./settings";
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

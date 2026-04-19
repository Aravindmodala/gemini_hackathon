import type { UserPreferences } from '../../../types/user';
import { TONE_OPTIONS, THEME_OPTIONS, ATMOSPHERE_OPTIONS } from '../../../types/user';
import { ChipSelect } from '../atoms/ChipSelect';
import styles from './MoodStep.module.css';

interface MoodStepProps {
  preferences: UserPreferences;
  onChange: (patch: Partial<UserPreferences>) => void;
}

export function MoodStep({ preferences, onChange }: MoodStepProps) {
  return (
    <section className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.title}>The mood you crave</h2>
        <p className={styles.subtitle}>How should a story feel? Pick anything that resonates.</p>
      </header>

      <div className={styles.fields}>
        <ChipSelect
          label="Tones"
          options={TONE_OPTIONS}
          selected={preferences.tones}
          onChange={(tones) => onChange({ tones })}
        />

        <ChipSelect
          label="Themes that resonate"
          options={THEME_OPTIONS}
          selected={preferences.themes}
          onChange={(themes) => onChange({ themes })}
        />

        <ChipSelect
          label="Atmospheres you love"
          options={ATMOSPHERE_OPTIONS}
          selected={preferences.atmospheres}
          onChange={(atmospheres) => onChange({ atmospheres })}
        />
      </div>
    </section>
  );
}

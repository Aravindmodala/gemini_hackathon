import type { UserPreferences } from '../../../types/user';
import { AUTHOR_SUGGESTIONS, GENRE_OPTIONS } from '../../../types/user';
import { ChipSelect } from '../atoms/ChipSelect';
import { TagInput } from '../atoms/TagInput';
import styles from './LiteraryDNAStep.module.css';

interface LiteraryDNAStepProps {
  preferences: UserPreferences;
  onChange: (patch: Partial<UserPreferences>) => void;
}

export function LiteraryDNAStep({ preferences, onChange }: LiteraryDNAStepProps) {
  return (
    <section className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.title}>Your literary DNA</h2>
        <p className={styles.subtitle}>What kind of stories light you up? All optional.</p>
      </header>

      <div className={styles.fields}>
        <ChipSelect
          label="Favorite genres"
          options={GENRE_OPTIONS}
          selected={preferences.favorite_genres}
          onChange={(favorite_genres) => onChange({ favorite_genres })}
        />

        <TagInput
          label="Favorite authors"
          value={preferences.favorite_authors}
          onChange={(favorite_authors) => onChange({ favorite_authors })}
          placeholder="e.g. Neil Gaiman"
          maxTags={5}
          suggestions={AUTHOR_SUGGESTIONS}
        />

        <TagInput
          label="Favorite books or series"
          value={preferences.favorite_books}
          onChange={(favorite_books) => onChange({ favorite_books })}
          placeholder="e.g. The Ocean at the End of the Lane"
          maxTags={5}
        />
      </div>
    </section>
  );
}

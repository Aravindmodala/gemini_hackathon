import { useCallback, useId, useRef, useState, type KeyboardEvent, type ChangeEvent } from 'react';
import styles from './TagInput.module.css';

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  maxLength?: number;
  suggestions?: readonly string[];
  label?: string;
}

export function TagInput({
  value,
  onChange,
  placeholder,
  maxTags = 5,
  maxLength = 60,
  suggestions,
  label,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const full = value.length >= maxTags;

  const handleFieldClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      inputRef.current?.focus();
    }
  }, []);

  const commit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim().slice(0, maxLength);
      if (!trimmed) return;
      if (value.length >= maxTags) return;
      const lowered = trimmed.toLowerCase();
      if (value.some((tag) => tag.toLowerCase() === lowered)) return;
      onChange([...value, trimmed]);
    },
    [value, onChange, maxTags, maxLength],
  );

  const removeAt = useCallback(
    (index: number) => {
      const next = value.slice();
      next.splice(index, 1);
      onChange(next);
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        commit(draft);
        setDraft('');
        return;
      }
      if (event.key === 'Backspace' && draft === '' && value.length > 0) {
        event.preventDefault();
        removeAt(value.length - 1);
      }
    },
    [commit, draft, value, removeAt],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value.slice(0, maxLength);
      setDraft(next);
    },
    [maxLength],
  );

  const handleBlur = useCallback(() => {
    setFocused(false);
    if (draft.trim()) {
      commit(draft);
      setDraft('');
    }
  }, [commit, draft]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.labelRow}>
        {label && <div className={styles.label}>{label}</div>}
        <div className={`${styles.counter} ${full ? styles.counterFull : ''}`}>
          {value.length}/{maxTags}
        </div>
      </div>

      <div
        className={`${styles.field} ${focused ? styles.fieldFocused : ''}`}
        onClick={handleFieldClick}
      >
        {value.map((tag, idx) => (
          <span key={`${tag}-${idx}`} className={styles.tag}>
            {tag}
            <button
              type="button"
              className={styles.remove}
              aria-label={`Remove ${tag}`}
              onClick={() => removeAt(idx)}
            >
              ×
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          placeholder={full ? '' : placeholder}
          maxLength={maxLength}
          disabled={full}
          list={suggestions ? listId : undefined}
        />

        {suggestions && (
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>
    </div>
  );
}

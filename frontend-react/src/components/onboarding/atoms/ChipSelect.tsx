import { useCallback } from 'react';
import styles from './ChipSelect.module.css';

interface ChipSelectProps {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  label?: string;
}

export function ChipSelect({ options, selected, onChange, label }: ChipSelectProps) {
  const toggle = useCallback(
    (option: string) => {
      const isSelected = selected.includes(option);
      const next = isSelected
        ? selected.filter((item) => item !== option)
        : [...selected, option];
      onChange(next);
    },
    [selected, onChange],
  );

  return (
    <div className={styles.wrapper}>
      {label && <div className={styles.label}>{label}</div>}
      <div className={styles.chips}>
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              className={`${styles.chip} ${active ? styles.chipActive : ''}`}
              aria-pressed={active}
              onClick={() => toggle(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

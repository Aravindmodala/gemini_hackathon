import { useRef, useEffect, useState } from 'react';
import styles from './StoryPrompt.module.css';

const SUGGESTIONS = [
  'A magical fantasy story set in an ancient forest',
  'A mystery aboard a fog-bound ocean liner',
  'An epic adventure across a dying world',
  'A quiet love story in a city at the end of summer',
  'A horror tale set in a lighthouse on a stormy night',
  'A science fiction story about the last human city',
];

interface StoryPromptProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  onTalkToElora?: () => void;
}

export function StoryPrompt({ onSubmit, disabled, onTalkToElora }: StoryPromptProps) {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  const handleSuggestion = (s: string) => {
    setPrompt(s);
    textareaRef.current?.focus();
  };

  const isSubmitDisabled = disabled || !prompt.trim();

  return (
    <div className={styles.container}>
      {/* Title */}
      <div className={styles.header}>
        <span className={styles.gem}>✦</span>
        <span className={styles.title}>What story shall Elora tell?</span>
      </div>

      {/* Suggestion chips */}
      <div className={styles.chips}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            className={styles.chip}
            onClick={() => handleSuggestion(s)}
            disabled={disabled}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Prompt input */}
      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Describe a story — any genre, any world…"
          rows={3}
          className={styles.textarea}
          disabled={disabled}
        />
        <button
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className={`${styles.submitBtn} ${isSubmitDisabled ? styles.submitBtnDisabled : ''}`}
        >
          <BookIcon />
          <span>Begin the Story</span>
        </button>
      </div>

      {/* Talk to Elora button */}
      {onTalkToElora && (
        <button
          onClick={onTalkToElora}
          disabled={disabled}
          className={`${styles.talkToEloraBtn} ${disabled ? styles.submitBtnDisabled : ''}`}
        >
          <span className={styles.eloraGem}>✦</span>
          <span>Talk to Elora first</span>
        </button>
      )}

      <p className={styles.hint}>⌘ Enter to begin · or talk to Elora to craft a personalized story</p>
    </div>
  );
}

function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

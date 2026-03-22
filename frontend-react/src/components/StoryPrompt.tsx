import { useState, useRef, useEffect } from 'react';

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
}

export function StoryPrompt({ onSubmit, disabled }: StoryPromptProps) {
  const [prompt, setPrompt] = useState('');
  const [textareaFocused, setTextareaFocused] = useState(false);
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

  return (
    <div style={styles.container}>
      {/* Title */}
      <div style={styles.header}>
        <span style={styles.gem}>✦</span>
        <span style={styles.title}>What story shall Elora tell?</span>
      </div>

      {/* Suggestion chips */}
      <div style={styles.chips}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            style={styles.chip}
            onClick={() => handleSuggestion(s)}
            onMouseEnter={(e) => {
              const btn = e.currentTarget;
              btn.style.transform = 'scale(1.05)';
              btn.style.background = 'rgba(124,58,237,0.15)';
              btn.style.border = '1px solid rgba(124,58,237,0.5)';
              btn.style.color = '#c4b5fd';
              btn.style.boxShadow = '0 0 16px rgba(124, 58, 237, 0.3)';
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget;
              btn.style.transform = 'scale(1)';
              btn.style.background = 'rgba(124,58,237,0.08)';
              btn.style.border = '1px solid rgba(124,58,237,0.3)';
              btn.style.color = '#94a3b8';
              btn.style.boxShadow = 'none';
            }}
            disabled={disabled}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Prompt input */}
      <div style={styles.inputRow}>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setTextareaFocused(true)}
          onBlur={() => setTextareaFocused(false)}
          placeholder="Describe a story — any genre, any world…"
          rows={3}
          style={{
            ...styles.textarea,
            ...(textareaFocused ? {
              background: 'rgba(255,255,255,0.08)',
              borderColor: 'rgba(124,58,237,0.6)',
              boxShadow: '0 0 20px rgba(124, 58, 237, 0.3), inset 0 0 20px rgba(124, 58, 237, 0.05)',
            } : {}),
          }}
          disabled={disabled}
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !prompt.trim()}
          onMouseEnter={(e) => {
            if (!disabled && prompt.trim()) {
              const btn = e.currentTarget;
              btn.style.transform = 'translateY(-2px)';
              btn.style.boxShadow = '0 0 32px rgba(124, 58, 237, 0.6), 0 8px 24px rgba(0, 0, 0, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget;
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 0 20px rgba(124,58,237,0.4)';
          }}
          style={{
            ...styles.submitBtn,
            ...(disabled || !prompt.trim() ? styles.submitBtnDisabled : {}),
          }}
        >
          <BookIcon />
          <span>Begin the Story</span>
        </button>
      </div>

      <p style={styles.hint}>⌘ Enter to begin</p>
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '6vh',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(680px, 92vw)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    zIndex: 20,
    padding: '24px 28px',
    background: 'rgba(5, 5, 20, 0.88)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(124,58,237,0.25)',
    borderRadius: 18,
    boxShadow: '0 8px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.1)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  gem: {
    color: '#7c3aed',
    fontSize: 16,
  },
  title: {
    fontFamily: "'Cinzel', 'Georgia', serif",
    fontSize: 15,
    fontWeight: 600,
    color: '#c4b5fd',
    letterSpacing: '0.06em',
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    padding: '5px 12px',
    borderRadius: 100,
    border: '1px solid rgba(124,58,237,0.3)',
    background: 'rgba(124,58,237,0.08)',
    color: '#94a3b8',
    fontSize: 12,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    transition: 'all 200ms ease',
    whiteSpace: 'nowrap',
    willChange: 'transform, background, border-color, box-shadow',
  } as React.CSSProperties,
  inputRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-end',
  },
  textarea: {
    flex: 1,
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(124,58,237,0.3)',
    borderRadius: 10,
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: "'Inter', sans-serif",
    lineHeight: 1.6,
    resize: 'none',
    outline: 'none',
    caretColor: '#7c3aed',
    transition: 'all 200ms ease',
  } as React.CSSProperties & { '&:focus'?: React.CSSProperties },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 20px',
    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: '0 0 20px rgba(124,58,237,0.4)',
    transition: 'all 0.2s',
    flexShrink: 0,
  },
  submitBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
  hint: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 11,
    color: '#475569',
    margin: 0,
    textAlign: 'center' as const,
  },
};

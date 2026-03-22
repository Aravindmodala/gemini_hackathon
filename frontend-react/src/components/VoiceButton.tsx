import { useState } from 'react';

interface VoiceButtonProps {
  isPlaying?: boolean;
  onToggle?: () => void;
}

export function VoiceButton({ isPlaying = false, onToggle }: VoiceButtonProps) {
  return (
    <button
      onClick={onToggle}
      style={{
        ...styles.button,
        ...(isPlaying ? styles.buttonActive : {}),
      }}
      title={isPlaying ? 'Pause narration' : 'Play narration'}
      aria-label={isPlaying ? 'Pause narration' : 'Play narration'}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill={isPlaying ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 1C6.48 1 2 5.48 2 11s4.48 10 10 10 10-4.48 10-10S17.52 1 12 1zm-2 15l-5-5 1.41-1.41L10 13.17l7.59-7.59L19 7l-9 9z" />
      </svg>
      <span style={styles.label}>{isPlaying ? 'Pause' : 'Narrate'}</span>
      {isPlaying && <span style={styles.pulse} />}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    background: 'rgba(124, 58, 237, 0.1)',
    border: '2px solid rgba(124, 58, 237, 0.3)',
    borderRadius: 8,
    color: '#7c3aed',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    transition: 'all 200ms ease',
    position: 'relative',
  },
  buttonActive: {
    background: 'rgba(124, 58, 237, 0.2)',
    borderColor: 'rgba(124, 58, 237, 0.6)',
    boxShadow: '0 0 16px rgba(124, 58, 237, 0.3)',
  },
  label: {
    whiteSpace: 'nowrap',
  },
  pulse: {
    position: 'absolute',
    inset: '-6px',
    borderRadius: '50%',
    border: '2px solid rgba(124, 58, 237, 0.4)',
    animation: 'pulse-ring 1.5s ease-out infinite',
  },
};

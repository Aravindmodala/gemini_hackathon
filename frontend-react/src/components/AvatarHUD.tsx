import type { StoryStatus } from '../hooks/useStoryteller';

interface AvatarHUDProps {
  status: StoryStatus;
  onStop: () => void;
  onNewStory: () => void;
}

const STATUS_LABELS: Record<StoryStatus, string> = {
  idle:       '',
  generating: 'Writing the story…',
  done:       'Story complete',
  error:      'Something went wrong',
};

const STATUS_COLORS: Record<StoryStatus, string> = {
  idle:       '#7c3aed',
  generating: '#a78bfa',
  done:       '#10b981',
  error:      '#ef4444',
};

export function AvatarHUD({ status, onStop, onNewStory }: AvatarHUDProps) {
  if (status === 'idle') return null;

  const color = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];
  const isGenerating = status === 'generating';

  // Animate in when component mounts
  const containerStyle: React.CSSProperties = {
    ...styles.container,
    animation: 'fade-in 0.4s ease-out',
  };

  return (
    <div style={containerStyle}>
      {/* Status badge */}
      <div style={{ ...styles.badge, borderColor: `${color}44`, boxShadow: `0 0 20px ${color}33` }}>
        <div style={{ ...styles.orb, background: color, boxShadow: `0 0 8px ${color}`, animation: isGenerating ? 'pulse-orb 1.5s ease-in-out infinite' : 'none' }} />
        <span style={styles.badgeLabel}>{label}</span>
        {isGenerating && <WritingDots />}
      </div>

      {/* Action button */}
      {isGenerating ? (
        <button 
          onClick={onStop}
          onMouseEnter={(e) => {
            const btn = e.currentTarget;
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = 'inset 0 0 0 1px rgba(239,68,68,0.5), 0 4px 20px rgba(239, 68, 68, 0.3)';
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget;
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = 'inset 0 0 0 1px rgba(239,68,68,0.3)';
          }}
          style={{ ...styles.btn, ...styles.stopBtn }}
        >
          <StopIcon />
          Stop
        </button>
      ) : (
        <button 
          onClick={onNewStory}
          onMouseEnter={(e) => {
            const btn = e.currentTarget;
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = '0 0 32px rgba(124, 58, 237, 0.6), 0 8px 24px rgba(0, 0, 0, 0.4)';
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget;
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 0 24px rgba(124,58,237,0.5)';
          }}
          style={{ ...styles.btn, ...styles.newBtn }}
        >
          <BookIcon />
          New Story
        </button>
      )}

      <style>{`
        @keyframes pulse-orb {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function WritingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 4 }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#a78bfa',
            animation: `dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '5vh',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    zIndex: 25,
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(5, 5, 20, 0.75)',
    border: '1px solid',
    borderRadius: 100,
    padding: '8px 18px',
    backdropFilter: 'blur(12px)',
    transition: 'all 0.4s ease',
  },
  orb: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  badgeLabel: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    fontWeight: 500,
    color: '#e2e8f0',
    letterSpacing: '0.05em',
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '11px 24px',
    border: 'none',
    borderRadius: 100,
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    fontSize: 14,
    letterSpacing: '0.04em',
    transition: 'all 0.2s',
  },
  stopBtn: {
    background: 'rgba(239,68,68,0.15)',
    color: '#fca5a5',
    boxShadow: 'inset 0 0 0 1px rgba(239,68,68,0.3)',
  },
  newBtn: {
    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
    color: '#fff',
    boxShadow: '0 0 24px rgba(124,58,237,0.5)',
  },
};




interface AvatarHUDProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'error';
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  disconnected: 'Talk to Elora',
  connecting:   'Awakening…',
  connected:    'Connected',
  listening:    'Listening…',
  speaking:     'Elora is speaking…',
  error:        'Connection lost',
};

const STATUS_COLORS: Record<string, string> = {
  disconnected: '#7c3aed',
  connecting:   '#a78bfa',
  connected:    '#06b6d4',
  listening:    '#10b981',
  speaking:     '#f59e0b',
  error:        '#ef4444',
};

// Simple waveform bars for the "speaking" state
function WaveformBars({ active }: { active: boolean }) {
  const bars = [0.4, 0.7, 1, 0.85, 0.6, 0.9, 0.5, 0.75, 0.45, 0.8];
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '3px',
      height: '28px',
    }}>
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: '3px',
            height: active ? `${h * 28}px` : '4px',
            borderRadius: '2px',
            background: 'linear-gradient(to top, #7c3aed, #06b6d4)',
            transition: 'height 0.15s ease',
            animation: active ? `soundbar 0.8s ease-in-out ${i * 0.08}s infinite alternate` : 'none',
          }}
        />
      ))}
      <style>{`
        @keyframes soundbar {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}

export function AvatarHUD({ status, onStart, onStop }: AvatarHUDProps) {
  const isIdle      = status === 'disconnected' || status === 'error';
  const isBusy      = status === 'connecting';
  const isListening = status === 'listening' || status === 'connected';
  const isSpeaking  = status === 'speaking';
  const isActive    = !isIdle;
  const glowColor   = STATUS_COLORS[status] ?? '#7c3aed';

  return (
    <div
      className="avatar-hud"
      style={{
        position: 'fixed',
        bottom: '5vh',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      {/* Status badge — only shown when session is active */}
      {!isIdle && (
      <div style={{
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(5, 5, 20, 0.7)',
        border: `1px solid ${glowColor}44`,
        borderRadius: '100px',
        padding: '6px 16px',
        backdropFilter: 'blur(12px)',
        boxShadow: `0 0 20px ${glowColor}33`,
        transition: 'all 0.4s ease',
      }}>
        {/* Status orb */}
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: glowColor,
          boxShadow: `0 0 8px ${glowColor}`,
          animation: isActive && !isSpeaking ? 'pulse-orb 1.5s ease-in-out infinite' : 'none',
        }} />
        <span style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '13px',
          fontWeight: 500,
          color: '#e2e8f0',
          letterSpacing: '0.05em',
        }}>
          {STATUS_LABELS[status]}
        </span>
        {isSpeaking && <WaveformBars active={true} />}
      </div>
      )}

      {/* Main CTA button */}
      <button
        onClick={isIdle ? onStart : onStop}
        disabled={isBusy}
        style={{ pointerEvents: 'auto' }}
        className={`hud-btn ${isActive ? 'hud-btn--active' : 'hud-btn--idle'} ${isBusy ? 'hud-btn--busy' : ''}`}
      >
        {/* Ripple ring */}
        <span className="hud-btn__ring" />
        <span className="hud-btn__ring hud-btn__ring--delay" />

        {/* Icon */}
        <span className="hud-btn__icon">
          {isIdle   && <MicIcon />}
          {isBusy   && <SpinnerIcon />}
          {isListening && <WaveIcon />}
          {isSpeaking  && <SoundIcon />}
        </span>

        {/* Label */}
        <span className="hud-btn__label">
          {isIdle      ? 'Talk to Elora' : ''}
          {isBusy      ? 'Awakening…'    : ''}
          {isListening ? 'End Session'   : ''}
          {isSpeaking  ? 'End Session'   : ''}
        </span>
      </button>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap');

        @keyframes pulse-orb {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        @keyframes ripple {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .hud-btn {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 32px;
          border: none;
          border-radius: 100px;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 15px;
          letter-spacing: 0.06em;
          transition: all 0.3s ease;
          overflow: visible;
        }

        .hud-btn--idle {
          background: linear-gradient(135deg, #7c3aed, #4f46e5);
          color: #fff;
          box-shadow:
            0 0 30px #7c3aed88,
            0 0 60px #7c3aed33,
            0 4px 20px rgba(0,0,0,0.5);
        }

        .hud-btn--idle:hover {
          transform: scale(1.06);
          box-shadow:
            0 0 40px #7c3aedbb,
            0 0 80px #7c3aed55,
            0 6px 30px rgba(0,0,0,0.6);
        }

        .hud-btn--active {
          background: linear-gradient(135deg, #1e1040, #0f0f1a);
          color: #a78bfa;
          box-shadow:
            0 0 20px #7c3aed44,
            inset 0 0 0 1px #7c3aed55;
        }

        .hud-btn--busy {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .hud-btn__ring {
          position: absolute;
          inset: 0;
          border-radius: 100px;
          border: 2px solid #7c3aed88;
          animation: ripple 2s ease-out infinite;
          pointer-events: none;
        }

        .hud-btn__ring--delay {
          border-color: #06b6d444;
          animation-delay: 1s;
        }

        .hud-btn--active .hud-btn__ring,
        .hud-btn--active .hud-btn__ring--delay {
          display: none;
        }

        .hud-btn__icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          flex-shrink: 0;
        }

        .hud-btn__label {
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}

// Icon components
function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" x2="12" y1="19" y2="22"/>
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h2"/>
      <path d="M6 8v8"/>
      <path d="M10 6v12"/>
      <path d="M14 8v8"/>
      <path d="M18 10v4"/>
      <path d="M22 12h-2"/>
    </svg>
  );
}

function SoundIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}

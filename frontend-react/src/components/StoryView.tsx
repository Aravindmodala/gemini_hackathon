import { useEffect, useRef } from 'react';
import type { StorySection, StoryStatus } from '../hooks/useStoryteller';

interface StoryViewProps {
  sections: StorySection[];
  status: StoryStatus;
  currentMusic: string | null;
}

export function StoryView({ sections, status, currentMusic }: StoryViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [sections]);

  // Trigger animation on first mount
  useEffect(() => {
    if (panelRef.current && sections.length > 0) {
      panelRef.current.style.animation = 'slide-up 0.5s ease-out forwards';
    }
  }, []);

  return (
    <div ref={panelRef} style={styles.panel}>
      <div style={styles.scroll}>

        {sections.map((section, i) => {
          if (section.type === 'text') {
            return (
              <p key={i} style={styles.prose}>
                {section.content}
              </p>
            );
          }

          if (section.type === 'image') {
            return (
              <figure key={i} style={{ ...styles.figure, animation: 'slide-up 0.5s ease-out' }}>
                <img
                  src={section.url}
                  alt={section.caption}
                  style={styles.image}
                  loading="lazy"
                  onLoad={(e) => {
                    (e.currentTarget as HTMLImageElement).style.animation = 'scale-in 0.4s ease-out';
                  }}
                />
                {section.caption && (
                  <figcaption style={styles.caption}>{section.caption}</figcaption>
                )}
              </figure>
            );
          }

          if (section.type === 'music') {
            const isPlaying = currentMusic === section.url;
            return (
              <div key={i} style={styles.musicBadge}>
                <MusicIcon active={isPlaying} />
                <span style={styles.musicLabel}>
                  {isPlaying ? 'Playing background music…' : 'Background music generated'}
                </span>
                <audio
                  src={section.url}
                  controls
                  style={styles.audioControl}
                />
              </div>
            );
          }

          return null;
        })}

        {/* Generating indicator */}
        {status === 'generating' && (
          <div style={styles.generating}>
            <span style={styles.cursor} />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MusicIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? '#a78bfa' : '#64748b'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, animation: active ? 'pulse-orb 1.5s ease-in-out infinite' : 'none' }}
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    top: '10vh',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(740px, 90vw)',
    maxHeight: '72vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(5, 5, 20, 0.82)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(124, 58, 237, 0.2)',
    borderRadius: 16,
    boxShadow: '0 8px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.08)',
    zIndex: 20,
    overflow: 'hidden',
  },
  scroll: {
    overflowY: 'auto',
    padding: '28px 32px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    scrollbarWidth: 'thin',
    scrollbarColor: 'rgba(124,58,237,0.3) transparent',
  },
  prose: {
    fontFamily: "'Georgia', 'Times New Roman', serif",
    fontSize: 17,
    lineHeight: 1.85,
    color: '#e2e8f0',
    margin: '0 0 20px 0',
    textAlign: 'justify' as const,
    textIndent: '1.5em',
    letterSpacing: '0.01em',
  },
  figure: {
    margin: '24px 0',
    padding: 0,
    borderRadius: 10,
    overflow: 'hidden',
    border: '1px solid rgba(124,58,237,0.2)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
  },
  image: {
    width: '100%',
    height: 'auto',
    display: 'block',
    objectFit: 'cover',
  },
  caption: {
    padding: '10px 14px',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
    background: 'rgba(0,0,0,0.3)',
  },
  musicBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 16px',
    margin: '16px 0',
    background: 'rgba(124,58,237,0.08)',
    border: '1px solid rgba(124,58,237,0.2)',
    borderRadius: 8,
    flexWrap: 'wrap' as const,
  },
  musicLabel: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    color: '#94a3b8',
    flex: 1,
    minWidth: 160,
  },
  audioControl: {
    height: 28,
    flex: '0 0 auto',
    accentColor: '#7c3aed',
    maxWidth: '100%',
  },
  generating: {
    padding: '4px 0 8px',
    display: 'flex',
    alignItems: 'center',
  },
  cursor: {
    display: 'inline-block',
    width: 2,
    height: 20,
    background: '#7c3aed',
    borderRadius: 1,
    animation: 'blink 1s step-end infinite',
  },
};

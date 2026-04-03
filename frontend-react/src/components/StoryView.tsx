import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { StorySection, StoryStatus } from '../hooks/useStoryteller';

interface StoryViewProps {
  sections: StorySection[];
  status: StoryStatus;
  currentMusic: string | null;
  title?: string;
  sidebarOffset?: number;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function StoryView({ sections, status, currentMusic, title, sidebarOffset }: StoryViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [sections, status]);

  // Find index of last text section for cursor placement
  let lastTextIndex = -1;
  for (let i = sections.length - 1; i >= 0; i--) {
    if (sections[i].type === 'text') {
      lastTextIndex = i;
      break;
    }
  }

  return (
    <>
      <style>{`
        @keyframes sv-fadeslide {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes sv-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }

        @keyframes sv-wave {
          0%, 100% { transform: scaleY(0.4); }
          50%       { transform: scaleY(1); }
        }

        .sv-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .sv-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .sv-scroll::-webkit-scrollbar-thumb {
          background: rgba(200, 169, 110, 0.2);
          border-radius: 2px;
        }
      `}</style>

      <div className="sv-scroll" style={{ ...styles.container, left: sidebarOffset ?? 0 }}>
        <div style={styles.column}>

          {/* Title header or spacer */}
          {title ? (
            <header style={styles.header}>
              <p style={styles.eyebrow}>THE EMOTIONAL CHRONICLER</p>
              <h1 style={styles.title}>{title}</h1>
              <div style={styles.rule} />
            </header>
          ) : (
            <div style={{ height: 72 }} />
          )}

          {/* Story sections */}
          {sections.map((section, i) => {
            const delay = Math.min(i * 0.04, 0.6);

            if (section.type === 'text') {
              const prevIsText = i > 0 && sections[i - 1].type === 'text';
              const isLastText = status === 'generating' && i === lastTextIndex;

              return (
                <p
                  key={i}
                  style={{
                    ...styles.prose,
                    textIndent: prevIsText ? '2em' : '0',
                    animation: `sv-fadeslide 0.5s ease-out forwards`,
                    animationDelay: `${delay}s`,
                    opacity: 0,
                  }}
                >
                  {section.content}
                  {isLastText && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 2,
                        height: 20,
                        background: '#c8a96e',
                        marginLeft: 4,
                        verticalAlign: 'text-bottom',
                        animation: 'sv-blink 1s step-end infinite',
                      }}
                    />
                  )}
                </p>
              );
            }

            if (section.type === 'image') {
              return (
                <div key={i}>
                  <div style={styles.separator}>· · ·</div>
                  <figure
                    style={{
                      ...styles.figure,
                      animation: 'sv-fadeslide 0.6s ease-out forwards',
                      animationDelay: `${delay}s`,
                      opacity: 0,
                    }}
                  >
                    <img
                      src={section.url}
                      alt={section.caption}
                      loading="lazy"
                      style={styles.image}
                    />
                    {section.caption && (
                      <figcaption style={styles.caption}>{section.caption}</figcaption>
                    )}
                  </figure>
                </div>
              );
            }

            if (section.type === 'music') {
              const isPlaying = currentMusic === section.url;
              const waveDelays = ['0s', '0.15s', '0.3s', '0.15s'];

              return (
                <div key={i} style={styles.musicWrapper}>
                  <div style={styles.musicPill}>
                    {/* Icon area */}
                    {isPlaying ? (
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 18 }}>
                        {waveDelays.map((d, wi) => (
                          <div
                            key={wi}
                            style={{
                              width: 3,
                              height: 18,
                              background: '#c8a96e',
                              borderRadius: 2,
                              transformOrigin: 'bottom',
                              animation: `sv-wave 0.8s ease-in-out infinite`,
                              animationDelay: d,
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <span
                        style={{
                          fontFamily: "'Playfair Display', Georgia, serif",
                          fontSize: 20,
                          color: '#c8a96e',
                          lineHeight: 1,
                        }}
                      >
                        ♪
                      </span>
                    )}

                    {/* Label */}
                    <span style={{ ...styles.musicLabel, color: isPlaying ? '#c8a96e' : '#8a7a6a' }}>
                      {isPlaying ? 'NOW PLAYING' : 'CHAPTER SCORE'}
                    </span>

                    {/* Duration */}
                    <span style={styles.musicDuration}>{formatDuration(section.duration)}</span>
                  </div>
                </div>
              );
            }

            return null;
          })}

          {/* Bottom sentinel for auto-scroll */}
          <div ref={bottomRef} />
        </div>
      </div>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,  // overridden by sidebarOffset prop at render time
    right: 0,
    bottom: 0,
    zIndex: 15,
    overflowY: 'auto',
    background: '#0c0c1a',
  },
  column: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '0 32px 80px',
  },

  // Title header
  header: {
    padding: '80px 0 48px',
    borderBottom: '1px solid rgba(200,169,110,0.15)',
    marginBottom: 56,
    textAlign: 'center',
  },
  eyebrow: {
    fontFamily: "'Cinzel', serif",
    fontSize: 10,
    color: '#c8a96e',
    letterSpacing: '0.35em',
    margin: '0 0 20px 0',
    textTransform: 'uppercase' as const,
  },
  title: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 40,
    fontWeight: 700,
    color: '#f0e6d3',
    lineHeight: 1.2,
    margin: 0,
  },
  rule: {
    width: 60,
    height: 1,
    background: 'rgba(200,169,110,0.4)',
    margin: '20px auto 0',
  },

  // Text prose
  prose: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 19,
    lineHeight: 1.9,
    color: '#f0e6d3',
    textAlign: 'justify' as const,
    letterSpacing: '0.012em',
    margin: '0 0 28px 0',
  },

  // Decorative separator
  separator: {
    textAlign: 'center' as const,
    color: 'rgba(200,169,110,0.4)',
    fontSize: 14,
    margin: '32px 0 32px',
    letterSpacing: '0.4em',
  },

  // Image figure — negative bleed past column padding
  figure: {
    margin: '0 -32px 48px',
    padding: 0,
  },
  image: {
    width: '100%',
    height: 'auto',
    display: 'block',
    objectFit: 'cover' as const,
    boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
  },
  caption: {
    fontFamily: "'Cinzel', serif",
    fontSize: 11,
    color: '#8a7a6a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.2em',
    textAlign: 'center' as const,
    padding: '12px 16px',
  },

  // Music badge
  musicWrapper: {
    display: 'flex',
    justifyContent: 'center',
    margin: '32px 0',
  },
  musicPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 24px',
    borderRadius: 100,
    border: '1px solid rgba(200,169,110,0.2)',
    background: 'rgba(200,169,110,0.07)',
  },
  musicLabel: {
    fontFamily: "'Cinzel', serif",
    fontSize: 11,
    letterSpacing: '0.2em',
    textTransform: 'uppercase' as const,
  },
  musicDuration: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#8a7a6a',
  },
};

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

interface EmptyStateProps {
  // No props needed for now
}

export function EmptyState(_props: EmptyStateProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger fade-in animation
    if (containerRef.current) {
      containerRef.current.style.animation = 'fade-in 0.6s ease-out forwards';
    }
  }, []);

  return (
    <div ref={containerRef} style={styles.container}>
      {/* Background glow elements */}
      <div style={styles.glowTop} />
      <div style={styles.glowBottom} />

      {/* Content */}
      <div style={styles.content}>
        <h1 style={styles.title}>The Emotional Chronicler</h1>
        <p style={styles.subtitle}>
          Craft magical stories through your emotions. Where imagination meets magic.
        </p>
        <p style={styles.description}>
          Share your feelings, your ideas, your dreams—and watch as they transform into enchanting tales for all ages.
        </p>
      </div>

      {/* Decorative elements */}
      <div style={styles.decorElements}>
        <div style={{ ...styles.star, left: '15%', top: '25%', animationDelay: '0s' }}>✦</div>
        <div style={{ ...styles.star, left: '85%', top: '30%', animationDelay: '0.5s' }}>✦</div>
        <div style={{ ...styles.star, left: '25%', bottom: '20%', animationDelay: '1s' }}>✦</div>
        <div style={{ ...styles.star, right: '20%', bottom: '25%', animationDelay: '1.5s' }}>✦</div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    pointerEvents: 'none',
  },
  glowTop: {
    position: 'absolute',
    top: '20%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '600px',
    height: '300px',
    background: 'radial-gradient(ellipse at center, rgba(124,58,237,0.15) 0%, transparent 70%)',
    borderRadius: '50%',
    filter: 'blur(60px)',
    pointerEvents: 'none',
  },
  glowBottom: {
    position: 'absolute',
    bottom: '10%',
    right: '10%',
    width: '400px',
    height: '400px',
    background: 'radial-gradient(ellipse at center, rgba(6,182,212,0.1) 0%, transparent 70%)',
    borderRadius: '50%',
    filter: 'blur(80px)',
    pointerEvents: 'none',
  },
  content: {
    textAlign: 'center',
    maxWidth: '600px',
    zIndex: 11,
    paddingBottom: '60px',
  },
  title: {
    fontFamily: "'Cinzel', serif",
    fontSize: 56,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #fff 0%, #a78bfa 60%, #67e8f9 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    letterSpacing: '0.08em',
    marginBottom: '16px',
    lineHeight: 1.2,
    animation: 'fade-in 0.8s ease-out 0.2s forwards',
    opacity: 0,
  },
  subtitle: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 18,
    fontWeight: 500,
    color: '#c4b5fd',
    marginBottom: '12px',
    letterSpacing: '0.03em',
    animation: 'fade-in 0.8s ease-out 0.4s forwards',
    opacity: 0,
  },
  description: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 1.6,
    animation: 'fade-in 0.8s ease-out 0.6s forwards',
    opacity: 0,
  },
  decorElements: {
    position: 'absolute',
    inset: 0,
    zIndex: 10,
  },
  star: {
    position: 'absolute',
    fontSize: '16px',
    color: '#a78bfa',
    opacity: 0.6,
    animation: 'float 4s ease-in-out infinite',
    textShadow: '0 0 10px rgba(124, 58, 237, 0.4)',
  },
};

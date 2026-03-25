import { useEffect, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import type { StorySection } from '../../hooks/useStoryteller';
import { paginate } from '../../utils/storyToPages';
import { useBookState } from './useBookState';
import { BookScene } from './BookScene';
import styles from './Book3D.module.css';

interface Book3DProps {
  sections: StorySection[];
  status: 'idle' | 'generating' | 'done' | 'error';
  onClose: () => void;
  title?: string;
}

export function Book3D({ sections, status, onClose, title }: Book3DProps) {
  const pages = paginate(sections);
  const {
    currentPageIdx,
    openBook,
    closeBook,
    goNext,
    goPrev,
    isOpen,
    isOpening,
    isClosing,
    isClosed,
    isFlipping,
    isFlippingNext,
    isFlippingPrev,
  } = useBookState();

  const handleClose = useCallback(() => {
    closeBook();
    // Delay the parent onClose so the animation plays
    setTimeout(onClose, 1300);
  }, [closeBook, onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (isOpen) goNext(pages.length);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (isOpen) goPrev();
      } else if (e.key === 'Escape') {
        if (isOpen) handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, goNext, goPrev, handleClose, pages.length]);

  return (
    <div className={styles.book3DRoot} data-testid="book-view">

      {/* ── 3D Canvas ────────────────────────────────────────── */}
      <div className={styles.canvasWrap}>
        <Canvas
          shadows
          camera={{ position: [0, 0.3, 5.5], fov: 52 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          dpr={[1, 2]}
        >
          <Suspense fallback={null}>
            <BookScene
              title={title}
              isOpen={isOpen}
              isOpening={isOpening}
              isClosing={isClosing}
              pages={pages}
              currentPageIdx={currentPageIdx}
              isFlippingNext={isFlippingNext}
              isFlippingPrev={isFlippingPrev}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* ── HTML overlay controls ─────────────────────────────── */}
      <div className={styles.overlay}>

        {/* Top bar: voice + generating badge */}
        <div className={styles.topBar}>
          <VoiceButton />
          {status === 'generating' && (
            <div className={styles.generatingBadge} role="status" aria-label="Generating story">
              <span className={styles.generatingDot} aria-hidden="true" />
              <span className={styles.generatingDot} aria-hidden="true" />
              <span className={styles.generatingDot} aria-hidden="true" />
              <span className={styles.generatingText}>Generating story...</span>
            </div>
          )}
        </div>

        {/* Bottom controls */}
        {isClosed && !isOpening ? (
          // Closed state: Open Book CTA
          <div className={styles.openBookWrap}>
            <button
              className={styles.openBookBtn}
              onClick={openBook}
              aria-label="Open book"
            >
              <BookIcon />
              Open Book
              <span className={styles.openBookGlow} aria-hidden="true" />
            </button>
          </div>
        ) : isOpen || isOpening || isClosing ? (
          // Open state: navigation
          <div className={styles.bottomBar}>
            <div className={styles.controlsGroup}>
              <button
                className={styles.closeBtn}
                onClick={handleClose}
                title="Close book"
                aria-label="Close book"
              >
                ✕
              </button>
            </div>

            <div className={styles.controlsCenter}>
              <button
                className={styles.navBtn}
                onClick={goPrev}
                disabled={currentPageIdx === 0 || isFlipping || isOpening}
                aria-label="Previous page"
              >
                ← Prev
              </button>

              <div className={styles.pageCounter}>
                <span className={styles.pageCounterText}>
                  Page <strong>{currentPageIdx + 1}</strong> of <strong>{pages.length || 1}</strong>
                </span>
                <div
                  className={styles.progressBar}
                  role="progressbar"
                  aria-valuenow={currentPageIdx + 1}
                  aria-valuemin={1}
                  aria-valuemax={pages.length || 1}
                >
                  <div
                    className={styles.progressFill}
                    style={{ width: `${((currentPageIdx + 1) / (pages.length || 1)) * 100}%` }}
                  />
                </div>
              </div>

              <button
                className={styles.navBtn}
                onClick={() => goNext(pages.length)}
                disabled={currentPageIdx >= (pages.length - 1) || isFlipping || isOpening}
                aria-label="Next page"
              >
                Next →
              </button>
            </div>

            <div className={styles.controlsGroup} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Voice button ─────────────────────────────────────────────
function VoiceButton() {
  return (
    <button
      className={styles.voiceBtn}
      aria-label="Play narration"
      title="Play narration"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 1a9 9 0 0 1 0 18" />
        <path d="M12 1a9 9 0 0 0 0 18" />
        <circle cx="12" cy="10" r="3" />
        <line x1="12" y1="13" x2="12" y2="21" />
        <line x1="8" y1="21" x2="16" y2="21" />
      </svg>
      <span>Narrate</span>
    </button>
  );
}

// ── Book icon ─────────────────────────────────────────────────
function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

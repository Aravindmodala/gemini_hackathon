/**
 * BookView — Realistic 3D CSS book for story consumption.
 *
 * Architecture:
 *  - Pure CSS 3D transforms (no WebGL) → all content stays in DOM → tests pass
 *  - Two-page spread: left page (prev) + right page (current, with flip animation)
 *  - Right page has front + back faces (backface-visibility: hidden)
 *  - Page flip: direct DOM style manipulation (useRef) for precise animation timing
 *  - Forward: rotateY(0 → -180deg) with transition
 *  - Backward: rotateY(-180 → 0deg) via instant set + double-RAF + transition
 *
 * Test safety:
 *  - Text sections render as <p> tags in DOM
 *  - Images render as <img> tags with alt attributes
 *  - All content accessible via screen.getByText / screen.getByAltText
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { StorySection } from '../hooks/useStoryteller';
import { paginate } from '../utils/storyToPages';
import type { BookPage } from '../utils/storyToPages';
import styles from './BookView.module.css';

const FLIP_DURATION = 700; // ms

// ── Props ─────────────────────────────────────────────────────
interface BookViewProps {
  sections: StorySection[];
  status: 'idle' | 'generating' | 'done' | 'error';
  onClose: () => void;
  title?: string;
}

// ── Sub-component: renders page content (text, images, music) ─
interface PageContentProps {
  page: BookPage | null;
  emptyLabel?: string;
}

function PageContent({ page, emptyLabel = 'Beginning of the story' }: PageContentProps) {
  if (!page) {
    return (
      <div className={styles.emptyPage}>
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.pageInner}>
        {page.sections.map((section, i) => {
          if (section.type === 'text') {
            return (
              <p key={i} className={styles.prose}>
                {section.content}
              </p>
            );
          }
          if (section.type === 'image') {
            return (
              <figure key={i} className={styles.pageFigure}>
                <img
                  src={section.url}
                  alt={section.caption}
                  className={styles.pageImage}
                  loading="lazy"
                />
                {section.caption && (
                  <figcaption className={styles.pageCaption}>{section.caption}</figcaption>
                )}
              </figure>
            );
          }
          if (section.type === 'music') {
            return (
              <div key={i} className={styles.musicBadge}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="#a78bfa" strokeWidth="2">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
                <span className={styles.musicLabel}>Background music</span>
                <audio src={section.url} controls className={styles.audioControl} />
              </div>
            );
          }
          return null;
        })}
      </div>
      <div className={styles.pageFooter}>
        <span className={styles.pageNumber}>{page.pageNumber}</span>
      </div>
    </>
  );
}

// ── Voice button (placeholder) ────────────────────────────────
interface VoiceBtnProps {
  isPlaying: boolean;
  onToggle: () => void;
}

function VoiceBtn({ isPlaying, onToggle }: VoiceBtnProps) {
  return (
    <button
      onClick={onToggle}
      className={`${styles.voiceBtn} ${isPlaying ? styles.voiceBtnActive : ''}`}
      title={isPlaying ? 'Pause narration' : 'Play narration'}
      aria-label={isPlaying ? 'Pause narration' : 'Play narration'}
    >
      {isPlaying ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 1a9 9 0 0 1 0 18" />
          <path d="M12 1a9 9 0 0 0 0 18" />
          <circle cx="12" cy="10" r="3" />
          <line x1="12" y1="13" x2="12" y2="21" />
          <line x1="8" y1="21" x2="16" y2="21" />
        </svg>
      )}
      <span>{isPlaying ? 'Pause' : 'Narrate'}</span>
      {isPlaying && <span className={styles.voicePulse} aria-hidden="true" />}
    </button>
  );
}

// ── Main BookView ─────────────────────────────────────────────
export function BookView({ sections, status, onClose, title }: BookViewProps) {
  const pages = paginate(sections);

  // Which page is currently the "right page" (active/primary)
  const [currentIdx, setCurrentIdx] = useState(0);
  // What's rendered on each face during animation
  const [rightFrontIdx, setRightFrontIdx] = useState(0);
  const [rightBackIdx, setRightBackIdx] = useState(1);
  const [leftIdx, setLeftIdx] = useState<number>(-1);

  const [isFlipping, setIsFlipping] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);

  const flipRef = useRef<HTMLDivElement>(null);

  // Keep display indices in sync when idle
  useEffect(() => {
    if (!isFlipping) {
      setRightFrontIdx(currentIdx);
      setRightBackIdx(currentIdx + 1);
      setLeftIdx(currentIdx - 1);
    }
  }, [currentIdx, isFlipping]);

  // ── Page navigation ───────────────────────────────────────────
  const goNext = useCallback(() => {
    if (isFlipping || currentIdx >= pages.length - 1 || !flipRef.current) return;

    const nextIdx = currentIdx + 1;
    setIsFlipping(true);
    setRightFrontIdx(currentIdx);
    setRightBackIdx(nextIdx);
    setLeftIdx(currentIdx - 1);

    // Forward: animate 0 → -180deg
    flipRef.current.style.transition =
      `transform ${FLIP_DURATION}ms cubic-bezier(0.645, 0.045, 0.355, 1)`;
    flipRef.current.style.transform = 'rotateY(-180deg)';

    setTimeout(() => {
      setCurrentIdx(nextIdx);
      if (flipRef.current) {
        // Reset without animation so next flip starts fresh
        flipRef.current.style.transition = 'none';
        flipRef.current.style.transform = 'rotateY(0deg)';
      }
      setIsFlipping(false);
    }, FLIP_DURATION);
  }, [isFlipping, currentIdx, pages.length]);

  const goPrev = useCallback(() => {
    if (isFlipping || currentIdx <= 0 || !flipRef.current) return;

    const prevIdx = currentIdx - 1;
    setIsFlipping(true);
    // Backward: front = destination page, back = page we're leaving
    setRightFrontIdx(prevIdx);
    setRightBackIdx(currentIdx);
    setLeftIdx(prevIdx - 1);

    // Step 1: set to -180deg instantly (no transition)
    flipRef.current.style.transition = 'none';
    flipRef.current.style.transform = 'rotateY(-180deg)';

    // Step 2: force reflow, then animate to 0deg
    flipRef.current.getBoundingClientRect(); // trigger reflow
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (flipRef.current) {
          flipRef.current.style.transition =
            `transform ${FLIP_DURATION}ms cubic-bezier(0.645, 0.045, 0.355, 1)`;
          flipRef.current.style.transform = 'rotateY(0deg)';
        }
      });
    });

    setTimeout(() => {
      setCurrentIdx(prevIdx);
      setIsFlipping(false);
    }, FLIP_DURATION);
  }, [isFlipping, currentIdx]);

  // ── Keyboard navigation ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'v') { setVoiceActive(v => !v); }
      else if (e.key === 'Escape') { onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, onClose]);

  // ── Derived display data ──────────────────────────────────────
  const getPage = (idx: number): BookPage | null =>
    idx >= 0 && idx < pages.length ? pages[idx] : null;

  const leftPage = getPage(leftIdx);
  const rightFrontPage = getPage(rightFrontIdx);
  const rightBackPage = getPage(rightBackIdx);

  return (
    <div className={styles.bookView} data-testid="book-view">

      {/* ── Top bar: voice + generating indicator ── */}
      <div className={styles.topBar}>
        <VoiceBtn isPlaying={voiceActive} onToggle={() => setVoiceActive(v => !v)} />
        {status === 'generating' && (
          <div className={styles.generatingBadge} role="status" aria-label="Generating story">
            <span className={styles.generatingDot} aria-hidden="true" />
            <span className={styles.generatingDot} aria-hidden="true" />
            <span className={styles.generatingDot} aria-hidden="true" />
            <span className={styles.generatingText}>Generating story...</span>
          </div>
        )}
      </div>

      {/* ── 3D Book ── */}
      <div className={styles.bookScene}>
        <div className={`${styles.bookTilt} ${isFlipping ? styles.bookTiltFlipping : ''}`}>
          <div className={styles.book}>

            {/* Left leather cover */}
            <div className={styles.coverLeft} aria-hidden="true" />

            {/* Spine */}
            <div className={styles.spine} aria-hidden="true" />

            {/* Pages region */}
            <div className={styles.pagesRegion}>

              {/* Left page — previous content (static) */}
              <div className={styles.pageLeft} aria-label="Previous page">
                <PageContent page={leftPage} emptyLabel={title || 'Beginning of the story'} />
              </div>

              {/* Right page — flip container */}
              <div
                ref={flipRef}
                className={styles.pageRightContainer}
                aria-label="Current page"
              >
                {/* Front face: current / destination-when-going-back */}
                <div className={styles.pageFront}>
                  <PageContent page={rightFrontPage} emptyLabel="Loading page..." />
                </div>

                {/* Back face: next / page-being-left-when-going-back */}
                <div className={styles.pageBack}>
                  <PageContent page={rightBackPage} emptyLabel="The End" />
                </div>
              </div>
            </div>

            {/* Page edge stack — right side */}
            <div className={styles.pageEdges} aria-hidden="true" />

            {/* Right leather cover */}
            <div className={styles.coverRight} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* ── Bottom controls ── */}
      <div className={styles.controls}>
        <div className={styles.controlsGroup}>
          <button
            className={styles.closeBtn}
            onClick={onClose}
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
            disabled={currentIdx === 0 || isFlipping}
            aria-label="Previous page"
          >
            ← Prev
          </button>

          <div className={styles.pageCounter}>
            <span className={styles.pageCounterText}>
              Page <strong>{currentIdx + 1}</strong> of <strong>{pages.length}</strong>
            </span>
            <div className={styles.progressBar} role="progressbar"
              aria-valuenow={currentIdx + 1} aria-valuemin={1} aria-valuemax={pages.length}>
              <div
                className={styles.progressFill}
                style={{ width: `${((currentIdx + 1) / pages.length) * 100}%` }}
              />
            </div>
          </div>

          <button
            className={styles.navBtn}
            onClick={goNext}
            disabled={currentIdx >= pages.length - 1 || isFlipping}
            aria-label="Next page"
          >
            Next →
          </button>
        </div>

        <div className={styles.controlsGroup} />
      </div>
    </div>
  );
}

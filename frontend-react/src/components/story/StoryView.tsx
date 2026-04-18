/**
 * StoryView — Cinematic editorial reader.
 *
 * Redesigned with Apple-level polish:
 *  - First image becomes a full-bleed parallax hero
 *  - Reading progress bar across the top
 *  - IntersectionObserver entrance animations on each section
 *  - Scene images reveal with a subtle scale animation
 *  - Elevated music pill with live waveform bars
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { CSSProperties, ImgHTMLAttributes, ReactElement } from 'react';
import type { StorySection, StoryStatus } from '../../hooks/useStoryteller';
import {
  formatStoryText,
  type InlineChunk,
} from '../../utils/formatStory';
import styles from './StoryView.module.css';

interface StoryViewProps {
  sections: StorySection[];
  status: StoryStatus;
  currentMusic: string | null;
  title?: string;
  sidebarOffset?: number;
  cardMode?: boolean;
  promoteFirstImageToHero?: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderSegments(segments: InlineChunk[]) {
  return segments.map((segment, idx) => {
    const className =
      segment.emphasis === 'bold'
        ? styles.emphasisBold
        : segment.emphasis === 'italic'
        ? styles.emphasisItalic
        : undefined;
    return (
      <span key={`segment-${idx}`} className={className}>
        {segment.text}
      </span>
    );
  });
}

interface StoryImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'children'> {
  src: string;
  renderFallback: () => ReactElement;
}

function StoryImage({ src, renderFallback, onError, ...imgProps }: StoryImageProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const handleError: ImgHTMLAttributes<HTMLImageElement>['onError'] = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      setHasError(true);
      onError?.(event);
    },
    [onError],
  );

  if (hasError) {
    return renderFallback();
  }

  return (
    <img
      {...imgProps}
      src={src}
      onError={handleError}
    />
  );
}

export function StoryView({
  sections,
  status,
  currentMusic,
  title,
  sidebarOffset,
  cardMode,
  promoteFirstImageToHero = false,
}: StoryViewProps) {
  const scrollRef   = useRef<HTMLDivElement>(null);
  const heroImgRef  = useRef<HTMLDivElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const [readProgress, setReadProgress] = useState(0);

  // ── Hero image: first image section becomes the full-bleed hero ──────────
  const heroIndex = promoteFirstImageToHero
    ? sections.findIndex(s => s.type === 'image')
    : -1;
  const rawHero   = heroIndex !== -1 ? sections[heroIndex] : null;
  const heroImage = rawHero?.type === 'image' ? rawHero : null;

  // ── Auto-scroll to bottom while generating ───────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [sections.length, status]);

  // ── Scroll: parallax + reading progress ──────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const max = scrollHeight - clientHeight;
    setReadProgress(max > 0 ? Math.min((scrollTop / max) * 100, 100) : 0);

    if (heroImgRef.current) {
      heroImgRef.current.style.transform = `translateY(${scrollTop * 0.35}px)`;
    }
  }, []);

  // ── IntersectionObserver: fade-slide each section into view ──────────────
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.visible);
            observer.unobserve(entry.target);
          }
        });
      },
      { root: container, threshold: 0.08 },
    );

    // Observe only elements not yet visible
    container.querySelectorAll(`.${styles.animSection}`).forEach(el => {
      if (!el.classList.contains(styles.visible)) {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, [sections.length]);

  // ── Find last text section (for streaming cursor) ────────────────────────
  let lastTextIndex = -1;
  for (let i = sections.length - 1; i >= 0; i--) {
    if (sections[i].type === 'text') { lastTextIndex = i; break; }
  }

  // ── Wave bar animation delays ────────────────────────────────────────────
  const waveDelays = ['0s', '0.18s', '0.36s', '0.18s'];

  const rootClass = cardMode ? styles.rootCard : styles.root;
  const rootStyle: CSSProperties | undefined = !cardMode
    ? { left: sidebarOffset ?? 0 }
    : undefined;

  return (
    <div className={rootClass} style={rootStyle}>
      {/* ── Reading progress bar ─────────────────────────────────────────── */}
      <div className={styles.progressTrack}>
        <div className={styles.progressBar} style={{ width: `${readProgress}%` }} />
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div className={styles.scrollArea} ref={scrollRef} onScroll={handleScroll}>

        {/* ── Hero zone: first image becomes cinematic backdrop ─────────── */}
        {heroImage && (
          <div className={styles.heroZone}>
            <div className={styles.heroImgWrap} ref={heroImgRef}>
              <StoryImage
                src={heroImage.url}
                alt={heroImage.caption || 'Story illustration'}
                className={styles.heroImg}
                draggable={false}
                renderFallback={() => (
                  <div className={`${styles.imgFallback} ${styles.heroFallback}`}>
                    <div className={styles.fallbackContent}>
                      <span className={styles.fallbackIcon} aria-hidden />
                      <p className={styles.fallbackTitle}>Image unavailable</p>
                      <p className={styles.fallbackHint}>We can't display this illustration right now.</p>
                    </div>
                  </div>
                )}
              />
            </div>
            <div className={styles.heroOverlay} />
            {title && (
              <div className={styles.heroContent}>
                <p className={styles.heroEyebrow}>THE EMOTIONAL CHRONICLER</p>
                <h1 className={styles.heroTitle}>{title}</h1>
                <div className={styles.heroOrn} aria-hidden>✦</div>
              </div>
            )}
          </div>
        )}

        {/* ── Editorial column ──────────────────────────────────────────── */}
        <div
          className={styles.column}
          style={heroImage ? { paddingTop: 44 } : undefined}
        >
          {/* No-hero header */}
          {!heroImage && title && (
            <header className={styles.header}>
              <p className={styles.eyebrow}>THE EMOTIONAL CHRONICLER</p>
              <h1 className={styles.title}>{title}</h1>
              <div className={styles.rule} />
            </header>
          )}
          {!heroImage && !title && <div style={{ height: 72 }} />}

          {/* ── Story sections ──────────────────────────────────────────── */}
          {sections.map((section, i) => {
            // Hero is already rendered above
            if (i === heroIndex) return null;

            const delay = Math.min(i * 0.03, 0.4);

            /* ── Text prose ─────────────────────────────────────────────── */
            if (section.type === 'text') {
              const blocks = formatStoryText(section.content);
              const prevIsText = i > 0 && sections[i - 1]?.type === 'text';
              const isLastTextSection = status === 'generating' && i === lastTextIndex;

              return blocks.map((block, blockIndex) => {
                const isLastTextBlock = isLastTextSection && blockIndex === blocks.length - 1;
                const key = `text-${i}-${blockIndex}-${block.type}`;

                if (block.type === 'paragraph') {
                  return (
                    <p
                      key={key}
                      data-testid={`story-block-paragraph-${i}-${blockIndex}`}
                      className={`${styles.animSection} ${styles.prose} ${styles.paragraphBlock}`}
                      style={{
                        transitionDelay: `${delay}s`,
                        textIndent: prevIsText ? '1.5em' : undefined,
                      }}
                    >
                      {renderSegments(block.chunks)}
                      {isLastTextBlock && <span className={styles.cursor} aria-hidden />}
                    </p>
                  );
                }

                if (block.type === 'heading') {
                  return (
                    <h2
                      key={key}
                      data-testid={`story-block-heading-${i}-${blockIndex}`}
                      className={`${styles.animSection} ${styles.headingBlock}`}
                      style={{ transitionDelay: `${delay}s` }}
                    >
                      {renderSegments(block.chunks)}
                    </h2>
                  );
                }

                if (block.type === 'sceneDivider') {
                  return (
                    <div
                      key={key}
                      data-testid={`story-block-divider-${i}-${blockIndex}`}
                      className={`${styles.animSection} ${styles.dividerBlock}`}
                      style={{ transitionDelay: `${delay}s` }}
                    >
                      {block.label || '...'}
                    </div>
                  );
                }

                if (block.type === 'dialogue') {
                  return (
                    <div
                      key={key}
                      data-testid={`story-block-dialogue-${i}-${blockIndex}`}
                      className={`${styles.animSection} ${styles.dialogueBlock}`}
                      style={{ transitionDelay: `${delay}s` }}
                    >
                      {block.speaker && (
                        <p className={styles.dialogueSpeaker}>{block.speaker}</p>
                      )}
                      <p className={styles.dialogueText}>
                        {renderSegments(block.chunks)}
                        {isLastTextBlock && <span className={styles.cursor} aria-hidden />}
                      </p>
                    </div>
                  );
                }

                return null;
              });
            }

            /* ── Scene image ────────────────────────────────────────────── */
            if (section.type === 'image') {
              return (
                <div
                  key={i}
                  className={`${styles.animSection} ${styles.sceneBlock}`}
                  style={{ transitionDelay: `${delay}s` }}
                >
                  <div className={styles.separator} aria-hidden>· · ·</div>
                  <figure className={styles.figure}>
                    <div className={styles.imgWrap}>
                      <StoryImage
                        src={section.url}
                        alt={section.caption || 'Story scene'}
                        loading="lazy"
                        className={styles.sceneImg}
                        renderFallback={() => (
                          <div className={`${styles.imgFallback} ${styles.sceneFallback}`}>
                            <div className={styles.fallbackContent}>
                              <span className={styles.fallbackIcon} aria-hidden />
                              <p className={styles.fallbackTitle}>Scene unavailable</p>
                              <p className={styles.fallbackHint}>We can't load this illustration right now.</p>
                            </div>
                          </div>
                        )}
                      />
                      <div className={styles.imgVignette} />
                    </div>
                    {section.caption && (
                      <figcaption className={styles.caption}>
                        {section.caption}
                      </figcaption>
                    )}
                  </figure>
                </div>
              );
            }

            /* ── Music pill ─────────────────────────────────────────────── */
            if (section.type === 'music') {
              const isPlaying = currentMusic === section.url;

              return (
                <div
                  key={i}
                  className={`${styles.animSection} ${styles.musicWrapper}`}
                  style={{ transitionDelay: `${delay}s` }}
                >
                  <div
                    className={`${styles.musicPill} ${isPlaying ? styles.musicPillActive : ''}`}
                    role="status"
                    aria-label={isPlaying ? 'Now playing chapter score' : 'Chapter score'}
                  >
                    {isPlaying ? (
                      <div className={styles.waveIcon} aria-hidden>
                        {waveDelays.map((d, wi) => (
                          <div
                            key={wi}
                            className={styles.waveBar}
                            style={{ animationDelay: d }}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className={styles.musicNote} aria-hidden>♪</span>
                    )}
                    <span
                      className={`${styles.musicLabel} ${isPlaying ? styles.musicLabelActive : ''}`}
                    >
                      {isPlaying ? 'NOW PLAYING' : 'CHAPTER SCORE'}
                    </span>
                    <span className={styles.musicDuration}>
                      {formatDuration(section.duration)}
                    </span>
                  </div>
                </div>
              );
            }

            return null;
          })}

          {/* Auto-scroll sentinel */}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

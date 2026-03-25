import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { BookPage } from '../../utils/storyToPages';
import { B } from './BookMesh';

// ── Page layout constants ───────────────────────────────────
const PAGE_W = 2.4;
const PAGE_H = 3.7;
const PAGE_Z = B.PAGE_Z + 0.003;

// Page centers in book-local coords (inside the shifting group).
// Spine hinge is at B.PIVOT_X = -1.35.
// Left page: its right edge touches the hinge.
// Right page: its left edge starts at hinge + spine width.
const LEFT_X = B.PIVOT_X - PAGE_W / 2;                    // -2.55
const RIGHT_X = B.PIVOT_X + B.SPINE_W + PAGE_W / 2;       // 0.07

// ── Image with fallback ─────────────────────────────────────
function ImageWithFallback({ src, alt, style }: { src: string; alt?: string; style: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(139,115,85,0.08)', padding: '18px 12px', minHeight: 100,
        borderRadius: 4,
      }}>
        <span style={{
          fontFamily: "'Georgia', serif", fontSize: 11, color: '#a08868',
          fontStyle: 'italic', textAlign: 'center', lineHeight: 1.5,
        }}>
          {alt ? `✦ ${alt}` : '✦ Illustration unavailable'}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      style={style}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

// ── Page content renderer ───────────────────────────────────
interface PageContentProps {
  page: BookPage | null;
  emptyLabel?: string;
}

function PageContent({ page, emptyLabel = 'Beginning of the story' }: PageContentProps) {
  if (!page) {
    return (
      <div style={S.empty}>
        <span style={S.emptyLabel}>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div style={S.inner}>
      {page.sections.map((section, i) => {
        if (section.type === 'text') {
          return <p key={i} style={S.prose}>{section.content}</p>;
        }
        if (section.type === 'image') {
          return (
            <figure key={i} style={S.figure}>
              <ImageWithFallback src={section.url} alt={section.caption} style={S.img} />
              {section.caption && (
                <figcaption style={S.caption}>{section.caption}</figcaption>
              )}
            </figure>
          );
        }
        if (section.type === 'music') {
          return (
            <div key={i} style={S.musicBadge}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <span style={S.musicLabel}>Background music</span>
              <audio src={section.url} controls style={S.audio} />
            </div>
          );
        }
        return null;
      })}
      <div style={S.footer}>
        <span style={S.pageNum}>{page.pageNumber}</span>
      </div>
    </div>
  );
}

// ── Content styles ──────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  empty: {
    width: '100%', height: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  emptyLabel: {
    fontFamily: "'Georgia', 'Times New Roman', serif",
    fontSize: '14px',
    color: '#a08868',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  inner: {
    width: '100%', height: '100%',
    display: 'flex', flexDirection: 'column',
    overflowY: 'auto',
    padding: '22px 18px 10px',
    boxSizing: 'border-box',
    scrollbarWidth: 'thin',
    scrollbarColor: 'rgba(0,0,0,0.12) transparent',
  },
  prose: {
    fontFamily: "'Georgia', 'Times New Roman', serif",
    fontSize: '13px',
    lineHeight: 1.8,
    color: '#2a1a10',
    margin: '0 0 10px 0',
    textAlign: 'justify',
    textIndent: '1.5em',
    letterSpacing: '0.1px',
  },
  figure: {
    margin: '10px 0',
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
  },
  img: {
    width: '100%', height: 'auto',
    display: 'block', objectFit: 'cover',
    maxHeight: '180px',
  },
  caption: {
    padding: '5px 8px',
    fontFamily: "'Inter', sans-serif",
    fontSize: '10px',
    color: '#7a6a5a',
    fontStyle: 'italic',
    textAlign: 'center',
    background: 'rgba(0,0,0,0.03)',
  },
  musicBadge: {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '6px 8px', margin: '8px 0',
    background: 'rgba(124,58,237,0.04)',
    border: '1px solid rgba(124,58,237,0.12)',
    borderRadius: '4px', flexWrap: 'wrap',
  },
  musicLabel: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '10px', color: '#7a6a8a', flex: 1,
  },
  audio: { height: '20px', flex: '0 0 auto', maxWidth: '130px' },
  footer: {
    marginTop: 'auto', paddingTop: '8px',
    borderTop: '1px solid rgba(0,0,0,0.06)',
    display: 'flex', justifyContent: 'center',
  },
  pageNum: {
    fontFamily: "'Georgia', serif",
    fontSize: '10px',
    color: '#a89880',
    letterSpacing: '0.08em',
  },
};

// ── Page flip (geometry only — too fast for readable content) ─
function PageFlip({ isFlippingNext, isFlippingPrev }: {
  isFlippingNext: boolean;
  isFlippingPrev: boolean;
}) {
  const isFlipping = isFlippingNext || isFlippingPrev;
  const flipGroupRef = useRef<THREE.Group>(null);
  const flipRotRef = useRef(0);

  useEffect(() => {
    if (isFlippingNext) flipRotRef.current = 0;
    if (isFlippingPrev) flipRotRef.current = -Math.PI;
  }, [isFlippingNext, isFlippingPrev]);

  useFrame(() => {
    if (!flipGroupRef.current || !isFlipping) return;
    const target = isFlippingPrev ? 0 : -Math.PI;
    flipRotRef.current = THREE.MathUtils.lerp(flipRotRef.current, target, 0.08);
    flipGroupRef.current.rotation.y = flipRotRef.current;
  });

  if (!isFlipping) return null;

  const flipW = PAGE_W;
  const flipH = PAGE_H;
  const offsetX = flipW / 2 + B.SPINE_W / 2;

  return (
    <group position={[B.PIVOT_X, 0, 0]}>
      <group ref={flipGroupRef}>
        {/* Front face */}
        <mesh position={[offsetX, 0, PAGE_Z + 0.002]}>
          <planeGeometry args={[flipW, flipH]} />
          <meshStandardMaterial color="#d4c4a4" roughness={0.97} metalness={0} side={THREE.FrontSide} />
        </mesh>
        {/* Back face */}
        <mesh position={[offsetX, 0, PAGE_Z - 0.001]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[flipW, flipH]} />
          <meshStandardMaterial color="#c8b898" roughness={0.97} metalness={0} side={THREE.FrontSide} />
        </mesh>
      </group>
    </group>
  );
}

// ── Shared HTML styles ──────────────────────────────────────
const htmlPageStyle: React.CSSProperties = {
  width: 'clamp(160px, 21vw, 350px)',
  height: 'clamp(240px, 48vh, 530px)',
  pointerEvents: 'auto',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};

const pageWrapStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: 'linear-gradient(170deg, #f0e6d2 0%, #e4d4b8 50%, #d8c8a8 100%)',
  overflow: 'hidden',
  boxSizing: 'border-box',
  borderRadius: '2px',
  boxShadow: 'inset 0 0 12px rgba(0,0,0,0.05)',
};

// ── Open pages ──────────────────────────────────────────────
interface OpenPagesProps {
  pages: BookPage[];
  currentPageIdx: number;
  isOpen: boolean;
  isOpening?: boolean;
  isClosing?: boolean;
  isFlippingNext: boolean;
  isFlippingPrev: boolean;
}

export function OpenPages({
  pages,
  currentPageIdx,
  isOpen,
  isOpening,
  isClosing,
  isFlippingNext,
  isFlippingPrev,
}: OpenPagesProps) {
  // Show 3D planes during open/opening/closing, but HTML content only when fully open
  const showPlanes = isOpen || isOpening || isClosing;
  const showContent = isOpen;

  if (!showPlanes) return null;

  const getPage = (idx: number) => (idx >= 0 && idx < pages.length ? pages[idx] : null);
  const leftPage = getPage(currentPageIdx - 1);
  const rightPage = getPage(currentPageIdx);

  return (
    <group>
      {/* ── Left page plane ───────────────────────────────── */}
      <mesh position={[LEFT_X, 0, PAGE_Z]}>
        <planeGeometry args={[PAGE_W, PAGE_H]} />
        <meshStandardMaterial color="#c8b898" roughness={0.98} metalness={0} />
      </mesh>

      {showContent && (
        <Html
          center
          position={[LEFT_X, 0, PAGE_Z + 0.008]}
          zIndexRange={[10, 20]}
          style={htmlPageStyle}
        >
          <div style={pageWrapStyle}>
            <PageContent page={leftPage} emptyLabel="Beginning of the story" />
          </div>
        </Html>
      )}

      {/* ── Right page plane ──────────────────────────────── */}
      <mesh position={[RIGHT_X, 0, PAGE_Z]}>
        <planeGeometry args={[PAGE_W, PAGE_H]} />
        <meshStandardMaterial color="#d0c0a0" roughness={0.98} metalness={0} />
      </mesh>

      {showContent && (
        <Html
          center
          position={[RIGHT_X, 0, PAGE_Z + 0.008]}
          zIndexRange={[10, 20]}
          style={htmlPageStyle}
        >
          <div style={pageWrapStyle}>
            <PageContent page={rightPage} emptyLabel="Loading page..." />
          </div>
        </Html>
      )}

      {/* ── Page flip ─────────────────────────────────────── */}
      <PageFlip
        isFlippingNext={isFlippingNext}
        isFlippingPrev={isFlippingPrev}
      />
    </group>
  );
}

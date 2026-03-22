import type { StorySection } from '../hooks/useStoryteller';

interface BookPageProps {
  sections: StorySection[];
  pageNumber: number;
  isLeft?: boolean;
}

export function BookPage({ sections, pageNumber, isLeft }: BookPageProps) {
  return (
    <div style={styles.pageContainer}>
      <div style={styles.pageContent}>
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
              <figure key={i} style={styles.figure}>
                <img
                  src={section.url}
                  alt={section.caption}
                  style={styles.image}
                  loading="lazy"
                />
                {section.caption && (
                  <figcaption style={styles.caption}>{section.caption}</figcaption>
                )}
              </figure>
            );
          }

          if (section.type === 'music') {
            return (
              <div key={i} style={styles.musicBadge}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ color: '#a78bfa' }}
                >
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
                <span style={styles.musicLabel}>Background music</span>
                <audio src={section.url} controls style={styles.audioControl} />
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Page number footer */}
      <div style={styles.pageFooter}>
        <span style={styles.pageNumber}>{pageNumber}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    position: 'relative',
    padding: '32px 24px',
    background: 'linear-gradient(135deg, #ffffff 0%, #f9f8f6 100%)',
    color: '#1a1a1a',
    overflow: 'hidden',
  },
  pageContent: {
    flex: 1,
    overflowY: 'auto',
    paddingRight: '8px',
    scrollbarWidth: 'thin',
    scrollbarColor: 'rgba(0,0,0,0.2) transparent',
  },
  prose: {
    fontFamily: "'Georgia', 'Times New Roman', serif",
    fontSize: 15,
    lineHeight: 1.8,
    color: '#2a2a2a',
    margin: '0 0 16px 0',
    textAlign: 'justify',
    textIndent: '1.5em',
    letterSpacing: '0.3px',
  },
  figure: {
    margin: '20px 0',
    padding: 0,
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid rgba(0,0,0,0.1)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  image: {
    width: '100%',
    height: 'auto',
    display: 'block',
    objectFit: 'cover',
  },
  caption: {
    padding: '10px 12px',
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    background: '#f5f5f5',
    textAlign: 'center',
  },
  musicBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 14px',
    margin: '12px 0',
    background: 'rgba(124, 58, 237, 0.05)',
    border: '1px solid rgba(124, 58, 237, 0.15)',
    borderRadius: 6,
    flexWrap: 'wrap',
  },
  musicLabel: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  audioControl: {
    height: 24,
    flex: '0 0 auto',
  },
  pageFooter: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 12,
    borderTop: '1px solid rgba(0,0,0,0.08)',
    marginTop: 'auto',
  },
  pageNumber: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 12,
    color: '#999',
    fontWeight: 500,
  },
};

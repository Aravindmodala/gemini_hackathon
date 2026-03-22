interface BookControlsProps {
  currentPage: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  onClose: () => void;
}

export function BookControls({
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  onClose,
}: BookControlsProps) {
  return (
    <div style={styles.container}>
      {/* Left controls */}
      <div style={styles.controlGroup}>
        <button
          onClick={onClose}
          style={styles.closeBtn}
          title="Close book"
          aria-label="Close book"
        >
          ✕
        </button>
      </div>

      {/* Center: page info */}
      <div style={styles.pageInfo}>
        <button
          onClick={onPrevPage}
          disabled={currentPage === 1}
          style={{ ...styles.navBtn, ...styles.prevBtn }}
          title="Previous page"
          aria-label="Previous page"
        >
          ← Prev
        </button>

        <div style={styles.pageCounter}>
          <span style={styles.pageText}>
            Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
          </span>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${(currentPage / totalPages) * 100}%`,
              }}
            />
          </div>
        </div>

        <button
          onClick={onNextPage}
          disabled={currentPage === totalPages}
          style={{ ...styles.navBtn, ...styles.nextBtn }}
          title="Next page"
          aria-label="Next page"
        >
          Next →
        </button>
      </div>

      {/* Right controls - empty for now */}
      <div style={styles.controlGroup} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingBottom: 20,
    paddingTop: 12,
    borderTop: '1px solid rgba(0,0,0,0.1)',
  },
  controlGroup: {
    display: 'flex',
    gap: 8,
    minWidth: 60,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 6,
    border: '1px solid rgba(0,0,0,0.15)',
    background: 'rgba(0,0,0,0.02)',
    color: '#666',
    fontSize: 18,
    cursor: 'pointer',
    transition: 'all 200ms ease',
  },
  pageInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  navBtn: {
    padding: '8px 12px',
    background: 'rgba(124, 58, 237, 0.08)',
    border: '1px solid rgba(124, 58, 237, 0.2)',
    borderRadius: 6,
    color: '#7c3aed',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    transition: 'all 150ms ease',
    whiteSpace: 'nowrap',
  },
  prevBtn: {},
  nextBtn: {},
  pageCounter: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
  },
  pageText: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  progressBar: {
    height: 3,
    background: 'rgba(0,0,0,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #7c3aed, #4f46e5)',
    transition: 'width 400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
};

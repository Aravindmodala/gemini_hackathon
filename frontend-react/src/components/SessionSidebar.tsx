import { useState, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { Session } from '../types/session';
import { SIDEBAR_WIDTH } from '../config/layout';

/* ── helpers ─────────────────────────────────────── */

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek}w ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffDay / 365)}y ago`;
}

interface DateGroup {
  label: string;
  sessions: Session[];
}

function groupByDate(sessions: Session[]): DateGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 7 * 86400000;

  const today: Session[] = [];
  const yesterday: Session[] = [];
  const lastWeek: Session[] = [];
  const older: Session[] = [];

  for (const s of sessions) {
    const t = s.updated_at ? new Date(s.updated_at).getTime() : (s.created_at ? new Date(s.created_at).getTime() : 0);
    if (t >= todayStart) today.push(s);
    else if (t >= yesterdayStart) yesterday.push(s);
    else if (t >= weekStart) lastWeek.push(s);
    else older.push(s);
  }

  const groups: DateGroup[] = [];
  if (today.length) groups.push({ label: 'Today', sessions: today });
  if (yesterday.length) groups.push({ label: 'Yesterday', sessions: yesterday });
  if (lastWeek.length) groups.push({ label: 'Previous 7 Days', sessions: lastWeek });
  if (older.length) groups.push({ label: 'Older', sessions: older });
  return groups;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

/* ── types ───────────────────────────────────────── */

interface SessionSidebarProps {
  sessions: Session[];
  loading: boolean;
  activeSessionId: string | null;
  onNewStory: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onSignOut: () => void;
  userName: string | null;
  userEmail: string | null;
  userPhoto: string | null;
  isOpen: boolean;
  onToggle: () => void;
}

/* ── component ───────────────────────────────────── */

export function SessionSidebar({
  sessions,
  loading,
  activeSessionId,
  onNewStory,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onSignOut,
  userName,
  userEmail,
  userPhoto,
  isOpen,
  onToggle,
}: SessionSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleRenameStart = (session: Session) => {
    setRenamingId(session.session_id);
    setRenameValue(session.title);
  };

  const handleRenameConfirm = () => {
    if (renamingId && renameValue.trim()) {
      onRenameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const handleRenameCancel = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const handleDeleteConfirm = (sessionId: string) => {
    onDeleteSession(sessionId);
    setDeletingId(null);
  };

  const groups = groupByDate(sessions);
  const initial = (userName?.[0] ?? userEmail?.[0] ?? '?').toUpperCase();

  /* ── hamburger toggle (always visible) ─────────── */
  const toggleButton = (
    <button
      onClick={onToggle}
      style={styles.toggleBtn}
      title={isOpen ? 'Close sidebar' : 'Open sidebar'}
      aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
    >
      {isOpen ? '✕' : '☰'}
    </button>
  );

  /* ── overlay for mobile when sidebar is open ───── */
  const overlay = isOpen ? (
    <div style={styles.overlay} onClick={onToggle} />
  ) : null;

  return (
    <>
      {/* Toggle button — always visible */}
      {!isOpen && (
        <div style={styles.toggleWrap}>
          {toggleButton}
        </div>
      )}

      {/* Mobile overlay */}
      {overlay}

      {/* Sidebar panel */}
      <aside
        style={{
          ...styles.sidebar,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        {/* Top bar with toggle */}
        <div style={styles.topBar}>
          {toggleButton}
          <span style={styles.topBarTitle}>Sessions</span>
        </div>

        {/* New Story button */}
        <button style={styles.newStoryBtn} onClick={onNewStory}>
          <span style={{ marginRight: 8 }}>➕</span>
          New Story
        </button>

        {/* Session list */}
        <div style={styles.sessionList}>
          {loading && sessions.length === 0 ? (
            <div style={styles.emptyText}>Loading sessions…</div>
          ) : sessions.length === 0 ? (
            <div style={styles.emptyText}>No stories yet. Start your first adventure!</div>
          ) : (
            groups.map(group => (
              <div key={group.label}>
                <div style={styles.groupLabel}>{group.label}</div>
                {group.sessions.map(session => {
                  const isActive = session.session_id === activeSessionId;
                  const isHovered = session.session_id === hoveredId;
                  const isRenaming = session.session_id === renamingId;
                  const isDeleting = session.session_id === deletingId;

                  return (
                    <div
                      key={session.session_id}
                      style={{
                        ...styles.sessionItem,
                        ...(isActive ? styles.sessionItemActive : {}),
                        ...(isHovered && !isActive ? styles.sessionItemHover : {}),
                      }}
                      onMouseEnter={() => setHoveredId(session.session_id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={() => {
                        if (!isRenaming && !isDeleting) {
                          onSelectSession(session.session_id);
                        }
                      }}
                    >
                      {isDeleting ? (
                        /* Delete confirmation */
                        <div style={styles.confirmWrap}>
                          <span style={styles.confirmText}>Delete this story?</span>
                          <div style={styles.confirmBtns}>
                            <button
                              style={styles.confirmYes}
                              onClick={(e) => { e.stopPropagation(); handleDeleteConfirm(session.session_id); }}
                            >
                              Delete
                            </button>
                            <button
                              style={styles.confirmNo}
                              onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : isRenaming ? (
                        /* Rename inline input */
                        <div style={styles.renameWrap} onClick={(e) => e.stopPropagation()}>
                          <input
                            ref={renameInputRef}
                            style={styles.renameInput}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameConfirm();
                              if (e.key === 'Escape') handleRenameCancel();
                            }}
                            onBlur={handleRenameConfirm}
                          />
                        </div>
                      ) : (
                        /* Normal session display */
                        <>
                          <div style={styles.sessionContent}>
                            <div style={styles.sessionIcon}>📖</div>
                            <div style={styles.sessionInfo}>
                              <div style={styles.sessionTitle}>
                                {truncate(session.title || 'Untitled Story', 30)}
                              </div>
                              {session.preview && (
                                <div style={styles.sessionPreview}>
                                  {truncate(session.preview, 50)}
                                </div>
                              )}
                            </div>
                            <div style={styles.sessionTime}>
                              {relativeTime(session.updated_at ?? session.created_at)}
                            </div>
                          </div>

                          {/* Action buttons on hover */}
                          {isHovered && (
                            <div style={styles.actionBtns}>
                              <button
                                style={styles.actionBtn}
                                title="Rename"
                                onClick={(e) => { e.stopPropagation(); handleRenameStart(session); }}
                              >
                                ✏️
                              </button>
                              <button
                                style={styles.actionBtn}
                                title="Delete"
                                onClick={(e) => { e.stopPropagation(); setDeletingId(session.session_id); }}
                              >
                                🗑️
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Bottom user section */}
        <div style={styles.userSection}>
          <div style={styles.userInfo}>
            {userPhoto ? (
              <img src={userPhoto} alt="" style={styles.userAvatar} referrerPolicy="no-referrer" />
            ) : (
              <div style={styles.userAvatarFallback}>{initial}</div>
            )}
            <div style={styles.userDetails}>
              {userName && <div style={styles.userNameText}>{truncate(userName, 20)}</div>}
              {userEmail && <div style={styles.userEmailText}>{truncate(userEmail, 24)}</div>}
            </div>
          </div>
          <button style={styles.signOutBtn} onClick={onSignOut} title="Sign out">
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}

/* ── styles ──────────────────────────────────────── */

const styles: Record<string, CSSProperties> = {
  /* Toggle button (hamburger / close) */
  toggleWrap: {
    position: 'fixed',
    top: 16,
    left: 16,
    zIndex: 60,
  },
  toggleBtn: {
    background: 'rgba(15, 10, 26, 0.85)',
    border: '1px solid rgba(124, 58, 237, 0.3)',
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 18,
    width: 36,
    height: 36,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    transition: 'background 0.2s ease',
  },

  /* Mobile overlay */
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    zIndex: 49,
  },

  /* Sidebar panel */
  sidebar: {
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    background: '#0f0a1a',
    borderRight: '1px solid rgba(124, 58, 237, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 50,
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: "'Inter', sans-serif",
    overflow: 'hidden',
  },

  /* Top bar */
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 12px 8px',
    borderBottom: '1px solid rgba(124, 58, 237, 0.1)',
  },
  topBarTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#94a3b8',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
  },

  /* New Story button */
  newStoryBtn: {
    margin: '12px 12px 8px',
    padding: '10px 16px',
    background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.2s ease, transform 0.15s ease',
    letterSpacing: '0.02em',
  },

  /* Session list (scrollable) */
  sessionList: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '4px 0',
  },

  /* Empty state */
  emptyText: {
    padding: '24px 16px',
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 1.5,
  },

  /* Date group label */
  groupLabel: {
    padding: '12px 16px 4px',
    fontSize: 11,
    fontWeight: 600,
    color: '#64748b',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },

  /* Session item */
  sessionItem: {
    position: 'relative',
    padding: '10px 12px',
    margin: '1px 6px',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 200ms ease',
    borderLeft: '3px solid transparent',
  },
  sessionItemActive: {
    background: 'rgba(124, 58, 237, 0.25)',
    borderLeftColor: '#7c3aed',
    boxShadow: '0 0 16px rgba(124, 58, 237, 0.2)',
  },
  sessionItemHover: {
    background: 'rgba(124, 58, 237, 0.15)',
    boxShadow: '0 0 12px rgba(124, 58, 237, 0.15)',
    transform: 'translateX(4px)',
  },

  /* Session content row */
  sessionContent: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    minWidth: 0,
  },
  sessionIcon: {
    fontSize: 14,
    flexShrink: 0,
    marginTop: 2,
  },
  sessionInfo: {
    flex: 1,
    minWidth: 0,
  },
  sessionTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sessionPreview: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sessionTime: {
    fontSize: 10,
    color: '#475569',
    flexShrink: 0,
    marginTop: 2,
    whiteSpace: 'nowrap',
  },

  /* Hover action buttons */
  actionBtns: {
    display: 'flex',
    gap: 2,
    position: 'absolute',
    right: 8,
    top: 8,
    background: 'rgba(15, 10, 26, 0.9)',
    borderRadius: 6,
    padding: '2px 4px',
  },
  actionBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    padding: '2px 4px',
    borderRadius: 4,
    transition: 'background 0.15s ease',
    lineHeight: 1,
  },

  /* Rename inline */
  renameWrap: {
    width: '100%',
  },
  renameInput: {
    width: '100%',
    background: 'rgba(124, 58, 237, 0.1)',
    border: '1px solid rgba(124, 58, 237, 0.4)',
    borderRadius: 4,
    color: '#e2e8f0',
    fontSize: 13,
    padding: '4px 8px',
    fontFamily: "'Inter', sans-serif",
    outline: 'none',
    boxSizing: 'border-box' as const,
  },

  /* Delete confirmation */
  confirmWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  confirmText: {
    fontSize: 12,
    color: '#f87171',
    fontWeight: 500,
  },
  confirmBtns: {
    display: 'flex',
    gap: 6,
  },
  confirmYes: {
    background: '#dc2626',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
  },
  confirmNo: {
    background: 'rgba(100, 116, 139, 0.3)',
    border: 'none',
    borderRadius: 4,
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: 500,
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
  },

  /* Bottom user section */
  userSection: {
    borderTop: '1px solid rgba(124, 58, 237, 0.15)',
    padding: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    flex: 1,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    objectFit: 'cover',
    border: '1px solid rgba(124, 58, 237, 0.4)',
    flexShrink: 0,
  },
  userAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  userDetails: {
    minWidth: 0,
    flex: 1,
  },
  userNameText: {
    fontSize: 12,
    fontWeight: 600,
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  userEmailText: {
    fontSize: 10,
    color: '#64748b',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  signOutBtn: {
    background: 'none',
    border: '1px solid rgba(100, 116, 139, 0.3)',
    borderRadius: 6,
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: 500,
    padding: '5px 10px',
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    whiteSpace: 'nowrap',
    transition: 'color 0.2s ease, border-color 0.2s ease',
    flexShrink: 0,
  },
};

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AvatarHUD } from './components/layout/AvatarHUD';
import { SessionSidebar } from './components/layout/SessionSidebar';
import { useAuth } from './contexts/AuthContext';
import { useStoryteller } from './hooks/useStoryteller';
import { useSessions } from './hooks/useSessions';
import { useCompanionChat } from './hooks/useCompanionChat';
import { SIDEBAR_WIDTH } from './config/layout';
import type { StoryProposal, ChatMessage } from './hooks/useCompanionChat';
import type { StoryStatus, StorySection } from './hooks/useStoryteller';
import type { SessionDetail } from './types/session';
import { AuthScreen } from './components/auth/AuthScreen';
import './App.css';

/* ── Outlet context type — consumed by page components ── */

export interface AppOutletContext {
  // Story
  status: StoryStatus;
  sections: StorySection[];
  storyTitle: string | null;
  currentMusic: string | null;
  startStory: (prompt: string, companionSessionId?: string) => Promise<void>;
  stopStory: () => void;

  // Sessions
  fetchSessions: () => Promise<void>;
  getSessionDetail: (sessionId: string) => Promise<SessionDetail>;

  // Companion
  chatMessages: ChatMessage[];
  chatStreaming: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
  companionSessionId: string | null;
  proposal: StoryProposal | null;
  dismissProposal: () => void;

  // Layout
  isSidebarOpen: boolean;
}

/* ── Loading spinner shown while Firebase resolves auth state ── */
function LoadingScreen() {
  return (
    <div style={loadingStyles.backdrop}>
      <div style={loadingStyles.spinner} />
      <p style={loadingStyles.text}>Awakening the Chronicler…</p>
    </div>
  );
}

const loadingStyles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 20,
    background: 'radial-gradient(ellipse at 60% 80%, #1a0a3a 0%, #05051a 50%, #000008 100%)',
    zIndex: 100,
  },
  spinner: {
    width: 40, height: 40,
    border: '3px solid rgba(124,58,237,0.2)', borderTopColor: '#7c3aed',
    borderRadius: '50%', animation: 'authSpinner 0.8s linear infinite',
  },
  text: { fontFamily: "'Cinzel', serif", fontSize: 14, color: '#94a3b8', letterSpacing: '0.12em' },
};

/* ══════════════════════════════════════════════════════════════
   App — Layout shell with Router outlet
   ══════════════════════════════════════════════════════════════ */

function App() {
  const { user, loading, signOut, getIdToken } = useAuth();
  const navigate = useNavigate();

  const {
    sessions,
    loading: sessionsLoading,
    fetchSessions,
    getSessionDetail,
    deleteSession,
    renameSession,
    updateSessionInState,
  } = useSessions();

  const { status, sections, storyTitle, currentMusic, sessionId, startStory, stopStory } = useStoryteller({ getIdToken });

  const {
    messages: chatMessages,
    isStreaming: chatStreaming,
    sendMessage,
    clearMessages,
    sessionId: companionSessionId,
    proposal,
    dismissProposal,
  } = useCompanionChat({ getIdToken });

  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const isStoryPage = location.pathname.startsWith('/story');
  const lastFetchedSessionIdRef = useRef<string | null>(null);
  const lastPatchedTitleKeyRef = useRef<string>('');
  const lastPatchedThumbnailRef = useRef<string>('');

  useEffect(() => {
    if (!sessionId) {
      lastFetchedSessionIdRef.current = null;
      lastPatchedTitleKeyRef.current = '';
      lastPatchedThumbnailRef.current = '';
      return;
    }

    if (lastFetchedSessionIdRef.current === sessionId) {
      return;
    }

    lastFetchedSessionIdRef.current = sessionId;
    void fetchSessions();
  }, [sessionId, fetchSessions]);

  useEffect(() => {
    if (!sessionId || !storyTitle) {
      return;
    }

    const patchKey = `${sessionId}:${storyTitle}`;
    if (lastPatchedTitleKeyRef.current === patchKey) {
      return;
    }

    lastPatchedTitleKeyRef.current = patchKey;
    updateSessionInState(sessionId, {
      title: storyTitle,
      updated_at: new Date().toISOString(),
    });
  }, [sessionId, storyTitle, updateSessionInState]);

  // ── Capture first image from SSE → update sidebar thumbnail ───────────────
  useEffect(() => {
    if (!sessionId) return;
    const firstImage = sections.find(s => s.type === 'image');
    if (!firstImage || firstImage.type !== 'image') return;

    const patchKey = `${sessionId}:${firstImage.url}`;
    if (lastPatchedThumbnailRef.current === patchKey) return;

    lastPatchedThumbnailRef.current = patchKey;
    updateSessionInState(sessionId, { thumbnail_url: firstImage.url });
  }, [sessionId, sections, updateSessionInState]);

  // ── New story (reset everything) ──────────────────────────────────────────
  const handleNewStory = useCallback(() => {
    stopStory();
    clearMessages();
    navigate('/');
  }, [stopStory, clearMessages, navigate]);

  // ── Session selection → navigate to /story/:id ─────────────────────────────
  const handleSelectSession = useCallback((sessionId: string) => {
    stopStory();
    navigate(`/story/${sessionId}`);
  }, [stopStory, navigate]);

  const handleSignOut = useCallback(() => {
    stopStory();
    void signOut();
  }, [stopStory, signOut]);

  /* ── Auth gates ─────────────────────────────────────────── */
  if (loading) return <LoadingScreen />;
  if (!user)   return <AuthScreen />;

  /* ── Outlet context — available to all child pages ──────── */
  const outletContext: AppOutletContext = {
    status,
    sections,
    storyTitle,
    currentMusic,
    startStory,
    stopStory,

    fetchSessions,
    getSessionDetail,

    chatMessages,
    chatStreaming,
    sendMessage,
    clearMessages,
    companionSessionId,
    proposal,
    dismissProposal,

    isSidebarOpen,
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>

      {/* Session Sidebar */}
      <SessionSidebar
        sessions={sessions}
        loading={sessionsLoading}
        activeSessionId={null}
        onNewStory={handleNewStory}
        onSelectSession={handleSelectSession}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
        onSignOut={handleSignOut}
        userName={user.displayName}
        userEmail={user.email}
        userPhoto={user.photoURL}
        isOpen={isSidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
      />

      {/* Main content */}
      <div
        className="app-root"
        style={{ flex: 1, marginLeft: isSidebarOpen ? SIDEBAR_WIDTH : 0, position: 'relative', minHeight: '100vh' }}
      >
        {/* Top-left title badge — hidden on story pages */}
        {!isStoryPage && (
          <header className="app-header" style={{ left: isSidebarOpen ? 16 : 60 }}>
            <div className="title-badge">
              <span className="title-badge__gem">✦</span>
              <div>
                <h1 className="app-title">The Emotional Chronicler</h1>
                <p className="app-subtitle">Illustrated AI Storytelling</p>
              </div>
            </div>
          </header>
        )}

        {/* Child page rendered here */}
        <Outlet context={outletContext} />

        {/* Status badge + stop/new-story controls */}
        <AvatarHUD status={status} onStop={stopStory} onNewStory={handleNewStory} />
      </div>

    </div>
  );
}

export default App;

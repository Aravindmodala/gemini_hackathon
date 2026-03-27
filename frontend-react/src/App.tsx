import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';
import { AvatarHUD } from './components/AvatarHUD';
import { StoryPrompt } from './components/StoryPrompt';
import { StoryView } from './components/StoryView';
import { AuthScreen } from './components/AuthScreen';
import { SessionSidebar } from './components/SessionSidebar';
import { EmptyState } from './components/EmptyState';
import { CompanionChat } from './components/CompanionChat';
import { useAuth } from './contexts/AuthContext';
import { useStoryteller } from './hooks/useStoryteller';
import { useSessions } from './hooks/useSessions';
import { useCompanionChat } from './hooks/useCompanionChat';
import { SIDEBAR_WIDTH } from './config/layout';
import { resolveAssetUrl } from './utils/resolveAssetUrl';
import type { StorySection } from './hooks/useStoryteller';
import type { Interaction, ImageToolResult, MusicToolResult } from './types/session';
import './App.css';

/* ── Loading spinner shown while Firebase resolves auth state ── */
function LoadingScreen() {
  return (
    <div style={loadingStyles.backdrop}>
      <div style={loadingStyles.spinner} />
      <p style={loadingStyles.text}>Awakening the Chronicler…</p>
      <style>{`@keyframes authSpinner { to { transform: rotate(360deg); } }`}</style>
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
   App — gated on authentication
   Flow: idle → conversing → narrating → done
   ══════════════════════════════════════════════════════════════ */

function App() {
  const { user, loading, signOut, getIdToken } = useAuth();

  const { sessions, loading: sessionsLoading, fetchSessions, getSessionDetail, deleteSession, renameSession } = useSessions();

  const { status, sections, storyTitle, currentMusic, startStory, stopStory } = useStoryteller({ getIdToken });

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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [hydratedSections, setHydratedSections] = useState<StorySection[]>([]);
  const [isConversing, setIsConversing] = useState(false);

  // ── Start companion conversation ──────────────────────────────────────────
  const handleBeginConversation = useCallback(() => {
    setIsConversing(true);
    setActiveSessionId(null);
    setHydratedSections([]);
  }, []);

  // ── "Start the Journey" — transition from companion to story ──────────────
  const handleStartJourney = useCallback(() => {
    if (!proposal) return;

    setIsConversing(false);

    // Start story with companion context
    const storyPrompt = `${proposal.title}: ${proposal.brief}`;
    void startStory(storyPrompt, companionSessionId ?? undefined);
    void fetchSessions();
  }, [proposal, companionSessionId, startStory, fetchSessions]);

  // ── "Not ready yet" — dismiss proposal, keep conversing ───────────────────
  const handleNotReady = useCallback(() => {
    dismissProposal();
    // Send a follow-up to Elora so she knows
    sendMessage("I'm not ready yet, let's keep talking.");
  }, [dismissProposal, sendMessage]);

  // ── New story (reset everything) ──────────────────────────────────────────
  const handleNewStory = useCallback(() => {
    stopStory();
    setActiveSessionId(null);
    setHydratedSections([]);
    setIsConversing(false);
    clearMessages();
  }, [stopStory, clearMessages]);

  // ── Direct story start (from StoryPrompt — fallback if user types prompt directly)
  const handleBeginStory = useCallback((prompt: string) => {
    setActiveSessionId(null);
    setHydratedSections([]);
    setIsConversing(false);
    void startStory(prompt);
    void fetchSessions();
  }, [startStory, fetchSessions]);

  // ── Session selection ─────────────────────────────────────────────────────
  const handleSelectSession = useCallback(async (sessionId: string) => {
    stopStory();
    setActiveSessionId(sessionId);
    setHydratedSections([]);
    setIsConversing(false);

    try {
      const detail = await getSessionDetail(sessionId);
      const nextSections: StorySection[] = [];

      for (const interaction of detail.interactions as Interaction[]) {
        if (interaction.text && interaction.text.trim()) {
          nextSections.push({ type: 'text', content: interaction.text });
        }

        if (interaction.role !== 'tool') continue;

        const args = interaction.args ?? {};
        const imgArgs = args as unknown as ImageToolResult;
        const musArgs = args as unknown as MusicToolResult;

        const imageUrl = typeof imgArgs.url === 'string'
          ? imgArgs.url
          : null;
        const musicUrl = typeof musArgs.audio_url === 'string'
          ? musArgs.audio_url
          : (interaction.name?.toLowerCase().includes('music') && typeof musArgs.url === 'string' ? musArgs.url : null);

        if (imageUrl) {
          nextSections.push({
            type: 'image',
            url: resolveAssetUrl(imageUrl),
            caption: typeof imgArgs.caption === 'string' ? imgArgs.caption : '',
          });
        }

        if (musicUrl) {
          nextSections.push({
            type: 'music',
            url: resolveAssetUrl(musicUrl),
            duration: typeof musArgs.duration === 'number' ? musArgs.duration : 33,
          });
        }
      }

      if (nextSections.length === 0) {
        // Session exists but has no saved content (interrupted generation)
        console.warn('[Session] no content found for session:', sessionId);
        setActiveSessionId(null);
      }
      setHydratedSections(nextSections);
    } catch (err) {
      console.error('[Session] failed to load session detail:', err);
      setActiveSessionId(null);
      setHydratedSections([]);
    }
  }, [getSessionDetail, stopStory]);

  const handleSignOut = () => {
    stopStory();
    void signOut();
  };

  const storySections = activeSessionId ? hydratedSections : sections;
  const showStory = storySections.length > 0;
  const showPrompt = (status === 'idle' || status === 'error') && !showStory && !isConversing;

  /* ── Auth gates ─────────────────────────────────────────── */
  if (loading) return <LoadingScreen />;
  if (!user)   return <AuthScreen />;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>

      {/* Session Sidebar */}
      <SessionSidebar
        sessions={sessions}
        loading={sessionsLoading}
        activeSessionId={activeSessionId}
        onNewStory={handleNewStory}
        onSelectSession={(sessionId) => { void handleSelectSession(sessionId); }}
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
        {/* Top-left title badge */}
        <header className="app-header" style={{ left: 16 }}>
          <div className="title-badge">
            <span className="title-badge__gem">✦</span>
            <div>
              <h1 className="app-title">The Emotional Chronicler</h1>
              <p className="app-subtitle">Illustrated AI Storytelling</p>
            </div>
          </div>
        </header>

        {/* Empty state — shown when app loads and no story exists */}
        {!showStory && status === 'idle' && !isConversing && (
          <EmptyState />
        )}

        {/* Pre-story companion chat — shown when conversing */}
        <CompanionChat
          messages={chatMessages}
          isStreaming={chatStreaming}
          onSend={sendMessage}
          onClear={() => { clearMessages(); setIsConversing(false); }}
          proposal={proposal}
          onStartJourney={handleStartJourney}
          onNotReady={handleNotReady}
          visible={isConversing && !showStory}
        />

        {/* Story reader — shown once content starts arriving */}
        {showStory && (
          <StoryView
            key={activeSessionId ?? 'live'}
            sections={storySections}
            status={status}
            currentMusic={currentMusic}
            title={storyTitle ?? undefined}
            sidebarOffset={isSidebarOpen ? SIDEBAR_WIDTH : 0}
          />
        )}

        {/* Prompt input — shown when idle (includes "Talk to Elora" option) */}
        {showPrompt && (
          <StoryPrompt
            onSubmit={handleBeginStory}
            disabled={status !== 'idle'}
            onTalkToElora={handleBeginConversation}
          />
        )}

        {/* Status badge + stop/new-story controls */}
        <AvatarHUD status={status} onStop={stopStory} onNewStory={handleNewStory} />
      </div>

    </div>
  );
}

export default App;

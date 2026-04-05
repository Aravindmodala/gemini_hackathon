/**
 * CompanionChat — Pre-story conversation panel with Elora.
 *
 * Elora chats with the traveler to understand their emotions, mood, and
 * preferences before crafting a story. When she proposes a story, the
 * proposal is shown as a card with "Start the Journey" and "Not ready yet".
 */

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type { ChatMessage, StoryProposal } from '../../hooks/useCompanionChat';
import styles from './CompanionChat.module.css';

// ── Props ──────────────────────────────────────────────────────────────────────

interface CompanionChatProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
  proposal: StoryProposal | null;
  onStartJourney: () => void;
  onNotReady: () => void;
  visible: boolean;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EloraSignil() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={styles.eloraSignil}
    >
      <path
        d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
        stroke="#a78bfa"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function StreamingCursor() {
  return <span className={styles.cursor} aria-hidden="true" />;
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isElora = msg.role === 'elora';

  return (
    <div className={`${styles.message} ${isElora ? styles.messageElora : styles.messageUser}`}>
      {isElora && (
        <div className={styles.eloraLabel}>
          <EloraSignil />
          <span>Elora</span>
        </div>
      )}
      <p className={isElora ? styles.eloraText : styles.userText}>
        {msg.content || (msg.isStreaming ? '' : '…')}
        {msg.isStreaming && <StreamingCursor />}
      </p>
    </div>
  );
}

// ── Proposal card ──────────────────────────────────────────────────────────────

function ProposalCard({
  proposal,
  onStart,
  onNotReady,
}: {
  proposal: StoryProposal;
  onStart: () => void;
  onNotReady: () => void;
}) {
  return (
    <div className={styles.proposalCard} data-testid="proposal-card">
      <div className={styles.proposalHeader}>
        <span className={styles.proposalGem}>✦</span>
        <span className={styles.proposalLabel}>Your Story Awaits</span>
      </div>

      <h3 className={styles.proposalTitle}>{proposal.title}</h3>
      <p className={styles.proposalBrief}>{proposal.brief}</p>

      {proposal.emotions.length > 0 && (
        <div className={styles.proposalEmotions}>
          {proposal.emotions.map((emotion) => (
            <span key={emotion} className={styles.emotionTag}>
              {emotion}
            </span>
          ))}
          {proposal.genre && (
            <span className={styles.emotionTag}>{proposal.genre}</span>
          )}
        </div>
      )}

      <div className={styles.proposalActions}>
        <button
          className={styles.startBtn}
          onClick={onStart}
          data-testid="start-journey-btn"
        >
          <span>✦</span>
          <span>Start the Journey</span>
        </button>
        <button
          className={styles.notReadyBtn}
          onClick={onNotReady}
          data-testid="not-ready-btn"
        >
          Not ready yet
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CompanionChat({
  messages,
  isStreaming,
  onSend,
  onClear,
  proposal,
  onStartJourney,
  onNotReady,
  visible,
}: CompanionChatProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when visible
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [visible]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || isStreaming) return;
    onSend(draft);
    setDraft('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!visible) return null;

  const hasMessages = messages.length > 0;

  return (
    <div className={styles.root}>
      <div className={styles.panel} role="dialog" aria-label="Chat with Elora before your story" data-testid="companion-panel">

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <EloraSignil />
            <div>
              <span className={styles.headerTitle}>Elora</span>
              <span className={styles.headerSubtitle}>Your Storyteller</span>
            </div>
          </div>
          <div className={styles.headerActions}>
            {hasMessages && (
              <button
                className={styles.clearBtn}
                onClick={onClear}
                title="Start over"
                aria-label="Start over"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div className={styles.messages} ref={scrollRef} data-testid="companion-messages">
          {!hasMessages && (
            <div className={styles.emptyState}>
              <EloraSignil />
              <p className={styles.emptyText}>
                Tell Elora how you're feeling today, and she'll craft a story just for you.
              </p>
            </div>
          )}
          {messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
        </div>

        {/* Proposal card */}
        {proposal && (
          <ProposalCard
            proposal={proposal}
            onStart={onStartJourney}
            onNotReady={onNotReady}
          />
        )}

        {/* Input */}
        <form className={styles.inputRow} onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={proposal ? "Tell Elora more, or start the journey…" : "Tell Elora how you're feeling…"}
            rows={1}
            disabled={isStreaming}
            aria-label="Message to Elora"
            data-testid="companion-input"
          />
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={!draft.trim() || isStreaming}
            aria-label="Send message"
            data-testid="companion-send"
          >
            <SendIcon />
          </button>
        </form>

        <p className={styles.hint}>Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}

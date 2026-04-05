/**
 * StoryChatbot — In-story companion chat panel.
 *
 * Refined: gradient bot bubble border, animated empty state icon,
 * ripple send button, polished header with gradient top accent.
 */

import { useState, useRef, useEffect } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import styles from './StoryChatbot.module.css';

interface LocalChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
}

interface StoryChatbotProps {
  storyTitle?: string;
  isStoryGenerating: boolean;
}

function ChatIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#a78bfa"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 0 6px rgba(167, 139, 250, 0.55))' }}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function MessageBubble({ msg }: { msg: LocalChatMessage }) {
  const isBot = msg.role === 'bot';
  return (
    <div className={`${styles.message} ${isBot ? styles.messageBot : styles.messageUser}`}>
      {isBot && (
        <div className={styles.botLabel}>
          <ChatIcon size={14} />
          <span>Story</span>
        </div>
      )}
      <p className={isBot ? styles.botText : styles.userText}>
        {msg.content}
      </p>
    </div>
  );
}

export function StoryChatbot({ storyTitle, isStoryGenerating }: StoryChatbotProps) {
  const [draft, setDraft]     = useState('');
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || isStoryGenerating) return;

    const userMsg: LocalChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: draft,
    };

    setMessages(prev => [
      ...prev,
      userMsg,
      {
        id: crypto.randomUUID(),
        role: 'bot',
        content: 'Story chat is coming soon. For now, enjoy the tale unfolding beside you.',
      },
    ]);
    setDraft('');
    // TODO: integrate with backend chat API
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={styles.root}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <ChatIcon />
          <div>
            <span className={styles.headerTitle}>Story Chat</span>
            <span className={styles.headerSubtitle}>
              {storyTitle ? `About: ${storyTitle}` : 'Talk to your story'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Messages ────────────────────────────────────────────── */}
      <div className={styles.messages} ref={scrollRef}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconWrap} aria-hidden>
              <ChatIcon size={22} />
            </div>
            <p className={styles.emptyText}>
              Ask questions about your story, explore characters, or shape what happens next.
            </p>
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
      </div>

      {/* ── Input ───────────────────────────────────────────────── */}
      <form className={styles.inputRow} onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isStoryGenerating ? 'Story is being written…' : 'Ask about your story…'
          }
          rows={1}
          disabled={isStoryGenerating}
          aria-label="Message about the story"
        />
        <button
          type="submit"
          className={styles.sendBtn}
          disabled={!draft.trim() || isStoryGenerating}
          aria-label="Send message"
        >
          <SendIcon />
        </button>
      </form>
      <p className={styles.hint}>Enter to send · Shift+Enter for new line</p>
    </div>
  );
}

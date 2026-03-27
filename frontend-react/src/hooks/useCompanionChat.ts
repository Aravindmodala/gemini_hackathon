/**
 * useCompanionChat — pre-story conversation with Elora.
 *
 * Sends messages to POST /api/v1/companion to chat with Elora (Gemini 2.0 Flash)
 * before story generation. Elora captures the user's mood, emotions, and
 * preferences, then proposes a story title and brief.
 *
 * The hook tracks the proposal and exposes a `startJourney` callback that
 * triggers story generation with the companion's session context.
 */

import { useState, useRef, useCallback } from 'react';
import { API_BASE } from '../config/api';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'elora';
  content: string;
  isStreaming?: boolean;
}

export interface StoryProposal {
  title: string;
  brief: string;
  emotions: string[];
  genre: string;
  tone: string;
}

export interface UseCompanionChatOptions {
  getIdToken?: () => Promise<string>;
}

// ── Proposal extraction ────────────────────────────────────────────────────────

function extractProposal(text: string): StoryProposal | null {
  const match = text.match(/```story_proposal\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    return {
      title: parsed.title || '',
      brief: parsed.brief || '',
      emotions: parsed.emotions || [],
      genre: parsed.genre || '',
      tone: parsed.tone || '',
    };
  } catch {
    return null;
  }
}

/** Strip the ```story_proposal JSON block from display text */
function cleanDisplayText(text: string): string {
  return text.replace(/```story_proposal\s*\n[\s\S]*?\n```/g, '').trim();
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useCompanionChat({
  getIdToken,
}: UseCompanionChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<StoryProposal | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // ── Send a message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    const eloraId = `e-${Date.now() + 1}`;
    const eloraPlaceholder: ChatMessage = {
      id: eloraId,
      role: 'elora',
      content: '',
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, eloraPlaceholder]);
    setIsStreaming(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let token: string | undefined;
      if (getIdToken) {
        token = await getIdToken();
      }

      const res = await fetch(`${API_BASE}/api/v1/companion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: trimmed,
          session_id: sessionIdRef.current ?? undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      if (!res.body) throw new Error('No response body');

      // ── Parse SSE stream ─────────────────────────────────────────────────
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          switch (event.type) {
            case 'session':
              sessionIdRef.current = event.session_id as string;
              setSessionId(event.session_id as string);
              break;

            case 'text':
              fullResponse += event.chunk as string;
              setMessages(prev =>
                prev.map(m =>
                  m.id === eloraId
                    ? { ...m, content: cleanDisplayText(m.content + (event.chunk as string)) }
                    : m,
                ),
              );
              break;

            case 'done': {
              // Check for a proposal in the full response
              const found = extractProposal(fullResponse);
              if (found) {
                setProposal(found);
              }
              setMessages(prev =>
                prev.map(m =>
                  m.id === eloraId ? { ...m, isStreaming: false } : m,
                ),
              );
              break;
            }

            case 'error':
              setMessages(prev =>
                prev.map(m =>
                  m.id === eloraId
                    ? { ...m, content: 'Something went wrong. Please try again.', isStreaming: false }
                    : m,
                ),
              );
              break;
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      console.error('[Companion] fetch error:', err);
      setMessages(prev =>
        prev.map(m =>
          m.id === eloraId
            ? { ...m, content: 'Could not reach Elora. Please try again.', isStreaming: false }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, getIdToken]);

  // ── Clear all messages ─────────────────────────────────────────────────────

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
    setSessionId(null);
    setProposal(null);
    sessionIdRef.current = null;
  }, []);

  // ── Dismiss proposal (user says "not ready yet") ──────────────────────────

  const dismissProposal = useCallback(() => {
    setProposal(null);
  }, []);

  return {
    messages,
    isStreaming,
    sendMessage,
    clearMessages,
    sessionId,
    proposal,
    dismissProposal,
  };
}

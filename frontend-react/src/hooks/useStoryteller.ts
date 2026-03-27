import { useState, useRef, useCallback, useEffect } from 'react';
import { API_BASE } from '../config/api';
import { resolveAssetUrl } from '../utils/resolveAssetUrl';

// ── Types ─────────────────────────────────────────────────────────────────────

export type StoryStatus = 'idle' | 'generating' | 'done' | 'error';

export type StorySection =
  | { type: 'text'; content: string }
  | { type: 'image'; url: string; caption: string }
  | { type: 'music'; url: string; duration: number };

export interface StorytellerOptions {
  getIdToken?: () => Promise<string>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStoryteller(options?: StorytellerOptions) {
  const [status, setStatus] = useState<StoryStatus>('idle');
  const [sections, setSections] = useState<StorySection[]>([]);
  const [currentMusic, setCurrentMusic] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Music playback ──────────────────────────────────────────────────────────

  const playMusic = useCallback((url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(url);
    audio.volume = 0.35;
    audio.play().catch(() => {/* autoplay blocked — user can interact to trigger */});
    audioRef.current = audio;
    setCurrentMusic(url);
    audio.onended = () => setCurrentMusic(null);
  }, []);

  // ── Append a text chunk to the last text section (or create one) ────────────

  const appendText = useCallback((chunk: string) => {
    setSections(prev => {
      const last = prev[prev.length - 1];
      if (last?.type === 'text') {
        return [...prev.slice(0, -1), { type: 'text', content: last.content + chunk }];
      }
      return [...prev, { type: 'text', content: chunk }];
    });
  }, []);

  // ── Start story ─────────────────────────────────────────────────────────────

  const startStory = useCallback(async (prompt: string, companionSessionId?: string) => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Stop any playing music
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setCurrentMusic(null);
    }

    setSections([]);
    setSessionId(null);
    setStoryTitle(null);
    setStatus('generating');

    try {
      let token: string | undefined;
      if (options?.getIdToken) {
        token = await options.getIdToken();
      }

      const res = await fetch(`${API_BASE}/api/v1/stories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt,
          ...(companionSessionId ? { companion_session_id: companionSessionId } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      if (!res.body) throw new Error('No response body');

      // ── Read SSE stream ────────────────────────────────────────────────────
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
              setSessionId(event.session_id as string);
              break;

            case 'title':
              setStoryTitle(event.title as string);
              break;

            case 'text':
              appendText(event.chunk as string);
              break;

            case 'image': {
              const imgUrl = resolveAssetUrl(event.url as string);
              setSections(prev => [
                ...prev,
                { type: 'image', url: imgUrl, caption: (event.caption as string) ?? '' },
              ]);
              break;
            }

            case 'music': {
              const musicUrl = resolveAssetUrl(event.url as string);
              setSections(prev => [
                ...prev,
                { type: 'music', url: musicUrl, duration: (event.duration as number) ?? 33 },
              ]);
              playMusic(musicUrl);
              break;
            }

            case 'done':
              setStatus('done');
              break;

            case 'error':
              console.error('[Story] Server error:', event.message);
              setStatus('error');
              break;
          }
        }
      }

      // Stream ended without explicit done (normal on abort)
      setStatus(prev => prev === 'generating' ? 'done' : prev);

    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        // User stopped — not an error
        setStatus('idle');
      } else {
        console.error('[Story] Fetch error:', err);
        setStatus('error');
      }
    }
  }, [options?.getIdToken, appendText, playMusic]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop story ──────────────────────────────────────────────────────────────

  const stopStory = useCallback(() => {
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setCurrentMusic(null);
    setStatus('idle');
  }, []);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      audioRef.current?.pause();
    };
  }, []);

  return {
    status,
    sections,
    currentMusic,
    sessionId,
    storyTitle,
    startStory,
    stopStory,
  };
}

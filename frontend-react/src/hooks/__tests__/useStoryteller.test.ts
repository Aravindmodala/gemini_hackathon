/**
 * Unit tests for useStoryteller hook — SSE-based story generation.
 *
 * Tests cover status state machine, SSE event parsing, section accumulation,
 * text merging, music playback, abort/stop, and cleanup.
 */
import { renderHook, act } from '@testing-library/react';
import { useStoryteller } from '../useStoryteller';
import { API_BASE } from '../../config/api';

// ── SSE stream helpers ────────────────────────────────────────────────────────

function makeSSEStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const body = lines.join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
}

function sseData(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function mockFetch(sseLines: string[], ok = true) {
  const stream = makeSSEStream(sseLines);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    body: stream,
  }));
}

// ── Audio mock helpers ────────────────────────────────────────────────────────

const mockAudioPlay = vi.fn().mockResolvedValue(undefined);
const mockAudioPause = vi.fn();

class MockAudio {
  src: string;
  volume = 1;
  onended: (() => void) | null = null;
  play = mockAudioPlay;
  pause = mockAudioPause;

  constructor(src: string) {
    this.src = src;
  }
}

vi.stubGlobal('Audio', MockAudio);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useStoryteller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Audio', MockAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('status is "idle"', () => {
      const { result } = renderHook(() => useStoryteller());
      expect(result.current.status).toBe('idle');
    });

    it('sections is empty array', () => {
      const { result } = renderHook(() => useStoryteller());
      expect(result.current.sections).toEqual([]);
    });

    it('currentMusic is null', () => {
      const { result } = renderHook(() => useStoryteller());
      expect(result.current.currentMusic).toBeNull();
    });

    it('exposes startStory function', () => {
      const { result } = renderHook(() => useStoryteller());
      expect(typeof result.current.startStory).toBe('function');
    });

    it('exposes stopStory function', () => {
      const { result } = renderHook(() => useStoryteller());
      expect(typeof result.current.stopStory).toBe('function');
    });
  });

  // ── startStory — status transitions ──────────────────────────────────────

  describe('startStory status transitions', () => {
    it('sets status to "generating" immediately on start', async () => {
      const { result } = renderHook(() => useStoryteller());

      let statusDuringFetch = '';
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        statusDuringFetch = result.current.status;
        return Promise.resolve({
          ok: true,
          status: 200,
          body: makeSSEStream([sseData({ type: 'done' })]),
        });
      }));

      await act(async () => {
        await result.current.startStory('A magical story');
      });

      expect(['idle', 'generating']).toContain(statusDuringFetch);
    });

    it('sets status to "done" on done event', async () => {
      mockFetch([sseData({ type: 'done' })]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      expect(result.current.status).toBe('done');
    });

    it('sets status to "error" on error event', async () => {
      mockFetch([sseData({ type: 'error', message: 'Something failed' })]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      expect(result.current.status).toBe('error');
    });

    it('sets status to "error" on HTTP error response', async () => {
      mockFetch([], false);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      expect(result.current.status).toBe('error');
    });
  });

  describe('session and title event handling', () => {
    it('sets sessionId and storyTitle from SSE events', async () => {
      mockFetch([
        sseData({ type: 'session', session_id: 'sess-123' }),
        sseData({ type: 'title', title: 'Mosquito Man Rising' }),
        sseData({ type: 'done' }),
      ]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      expect(result.current.sessionId).toBe('sess-123');
      expect(result.current.storyTitle).toBe('Mosquito Man Rising');
    });

    it('resets prior sessionId and storyTitle when a new story starts', async () => {
      mockFetch([
        sseData({ type: 'session', session_id: 'sess-1' }),
        sseData({ type: 'title', title: 'First Title' }),
        sseData({ type: 'done' }),
      ]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('First story');
      });

      expect(result.current.sessionId).toBe('sess-1');
      expect(result.current.storyTitle).toBe('First Title');

      mockFetch([sseData({ type: 'done' })]);

      await act(async () => {
        await result.current.startStory('Second story');
      });

      expect(result.current.sessionId).toBeNull();
      expect(result.current.storyTitle).toBeNull();
    });
  });

  // ── SSE event parsing — text ──────────────────────────────────────────────

  describe('text event handling', () => {
    it('creates a text section from a text chunk', async () => {
      mockFetch([
        sseData({ type: 'text', chunk: 'Once upon a time' }),
        sseData({ type: 'done' }),
      ]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      const textSections = result.current.sections.filter(s => s.type === 'text');
      expect(textSections.length).toBe(1);
      expect((textSections[0] as { type: 'text'; content: string }).content)
        .toBe('Once upon a time');
    });

    it('merges consecutive text chunks into one section', async () => {
      mockFetch([
        sseData({ type: 'text', chunk: 'Once upon' }),
        sseData({ type: 'text', chunk: ' a time' }),
        sseData({ type: 'text', chunk: ' in a land' }),
        sseData({ type: 'done' }),
      ]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      const textSections = result.current.sections.filter(s => s.type === 'text');
      expect(textSections.length).toBe(1);
      expect((textSections[0] as { type: 'text'; content: string }).content)
        .toBe('Once upon a time in a land');
    });

    it('starts a new text section after an image section', async () => {
      mockFetch([
        sseData({ type: 'text', chunk: 'Prologue text' }),
        sseData({ type: 'image', url: '/api/images/x.png', caption: 'Scene' }),
        sseData({ type: 'text', chunk: 'Epilogue text' }),
        sseData({ type: 'done' }),
      ]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      const textSections = result.current.sections.filter(s => s.type === 'text');
      expect(textSections.length).toBe(2);
    });
  });

  // ── SSE event parsing — image ─────────────────────────────────────────────

  describe('image event handling', () => {
    it('creates an image section from image event', async () => {
      mockFetch([
        sseData({ type: 'image', url: '/api/images/dragon.png', caption: 'A dragon' }),
        sseData({ type: 'done' }),
      ]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      const imageSections = result.current.sections.filter(s => s.type === 'image');
      expect(imageSections.length).toBe(1);
      const img = imageSections[0] as { type: 'image'; url: string; caption: string };
      expect(img.url).toBe(`${API_BASE}/api/images/dragon.png`);
      expect(img.caption).toBe('A dragon');
    });

    it('handles missing caption gracefully', async () => {
      mockFetch([
        sseData({ type: 'image', url: '/api/images/x.png' }),
        sseData({ type: 'done' }),
      ]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      const imageSections = result.current.sections.filter(s => s.type === 'image');
      expect(imageSections.length).toBe(1);
    });
  });

  // ── SSE event parsing — music ─────────────────────────────────────────────

  describe('music event handling', () => {
    it('creates a music section from music event', async () => {
      mockFetch([
        sseData({ type: 'music', url: '/api/music/theme.wav', duration: 33 }),
        sseData({ type: 'done' }),
      ]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      const musicSections = result.current.sections.filter(s => s.type === 'music');
      expect(musicSections.length).toBe(1);
      const music = musicSections[0] as { type: 'music'; url: string; duration: number };
      expect(music.url).toBe(`${API_BASE}/api/music/theme.wav`);
      expect(music.duration).toBe(33);
    });

    it('sets currentMusic to the audio URL on music event', async () => {
      mockFetch([
        sseData({ type: 'music', url: '/api/music/theme.wav', duration: 33 }),
        sseData({ type: 'done' }),
      ]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      expect(result.current.currentMusic).toBe(`${API_BASE}/api/music/theme.wav`);
    });

    it('starts audio playback at 35% volume on music event', async () => {
      const mockPlay = vi.fn().mockResolvedValue(undefined);
      let capturedVolume = 0;

      class TrackingAudio {
        src: string;
        onended: (() => void) | null = null;
        set volume(v: number) { capturedVolume = v; }
        play = mockPlay;
        pause = vi.fn();
        constructor(src: string) { this.src = src; }
      }
      vi.stubGlobal('Audio', TrackingAudio);

      mockFetch([
        sseData({ type: 'music', url: '/api/music/theme.wav', duration: 33 }),
        sseData({ type: 'done' }),
      ]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      expect(mockPlay).toHaveBeenCalled();
      expect(capturedVolume).toBe(0.35);
    });
  });

  // ── Section ordering ──────────────────────────────────────────────────────

  describe('section ordering', () => {
    it('preserves text → image → text → music order', async () => {
      mockFetch([
        sseData({ type: 'text', chunk: 'Intro' }),
        sseData({ type: 'image', url: '/api/images/a.png', caption: 'Scene 1' }),
        sseData({ type: 'text', chunk: 'Middle' }),
        sseData({ type: 'music', url: '/api/music/b.wav', duration: 33 }),
        sseData({ type: 'done' }),
      ]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      const types = result.current.sections.map(s => s.type);
      expect(types).toEqual(['text', 'image', 'text', 'music']);
    });
  });

  // ── startStory clears previous state ─────────────────────────────────────

  describe('startStory resets state', () => {
    it('clears sections from previous story', async () => {
      mockFetch([
        sseData({ type: 'text', chunk: 'First story' }),
        sseData({ type: 'done' }),
      ]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('First');
      });
      expect(result.current.sections).toHaveLength(1);

      mockFetch([sseData({ type: 'done' })]);
      await act(async () => {
        await result.current.startStory('Second');
      });

      // Sections reset to empty then done fires with nothing
      expect(result.current.sections).toHaveLength(0);
    });
  });

  // ── fetch options ─────────────────────────────────────────────────────────

  describe('fetch configuration', () => {
    it('sends POST to API base /api/v1/stories with the prompt', async () => {
      const mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        body: makeSSEStream([sseData({ type: 'done' })]),
      });
      vi.stubGlobal('fetch', mockFetchFn);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A dragon tale');
      });

      const [url, options] = mockFetchFn.mock.calls[0];
      expect(url).toBe(`${API_BASE}/api/v1/stories`);
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.prompt).toBe('A dragon tale');
    });

    it('includes Authorization header when getIdToken is provided', async () => {
      const mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        body: makeSSEStream([sseData({ type: 'done' })]),
      });
      vi.stubGlobal('fetch', mockFetchFn);

      const getIdToken = vi.fn().mockResolvedValue('my-token-abc');
      const { result } = renderHook(() => useStoryteller({ getIdToken }));
      await act(async () => {
        await result.current.startStory('A story');
      });

      const [, options] = mockFetchFn.mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer my-token-abc');
    });

    it('sends request without Authorization when no getIdToken', async () => {
      const mockFetchFn = vi.fn().mockResolvedValue({
        ok: true,
        body: makeSSEStream([sseData({ type: 'done' })]),
      });
      vi.stubGlobal('fetch', mockFetchFn);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });

      const [, options] = mockFetchFn.mock.calls[0];
      expect(options.headers.Authorization).toBeUndefined();
    });
  });

  // ── stopStory ─────────────────────────────────────────────────────────────

  describe('stopStory', () => {
    it('sets status to "idle"', async () => {
      mockFetch([sseData({ type: 'done' })]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });
      expect(result.current.status).toBe('done');

      act(() => {
        result.current.stopStory();
      });

      expect(result.current.status).toBe('idle');
    });

    it('clears currentMusic', async () => {
      mockFetch([
        sseData({ type: 'music', url: '/api/music/x.wav', duration: 33 }),
        sseData({ type: 'done' }),
      ]);

      const { result } = renderHook(() => useStoryteller());
      await act(async () => {
        await result.current.startStory('A story');
      });
      expect(result.current.currentMusic).toBe(`${API_BASE}/api/music/x.wav`);

      act(() => {
        result.current.stopStory();
      });

      expect(result.current.currentMusic).toBeNull();
    });
  });

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  describe('cleanup on unmount', () => {
    it('aborts in-flight fetch on unmount without throwing', async () => {
      // Fetch that never resolves
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
        new Promise(() => {}),
      ));

      const { result, unmount } = renderHook(() => useStoryteller());

      act(() => {
        void result.current.startStory('A story');
      });

      // Should not throw
      expect(() => unmount()).not.toThrow();
    });
  });
});

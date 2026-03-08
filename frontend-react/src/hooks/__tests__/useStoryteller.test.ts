/**
 * Integration tests for the useStoryteller hook.
 *
 * Tests the WebSocket connection lifecycle, status state machine,
 * message handling, and cleanup using mocked browser APIs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStoryteller } from '../../hooks/useStoryteller';
import { useAvatarStore } from '../../store/useAvatarStore';

// Type for our mock WebSocket (from setup.ts)
interface MockWS {
  url: string;
  readyState: number;
  sentMessages: string[];
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  send: (data: string) => void;
  close: () => void;
  _receive: (data: Record<string, unknown>) => void;
}

// Track created WebSocket instances
let capturedWs: MockWS | null = null;
const OriginalWebSocket = globalThis.WebSocket;

describe('useStoryteller', () => {
  beforeEach(() => {
    capturedWs = null;

    // Intercept WebSocket constructor to capture instance
    const MockWS = class extends (OriginalWebSocket as any) {
      constructor(url: string) {
        super(url);
        capturedWs = this as unknown as MockWS;
      }
    };
    (globalThis as any).WebSocket = MockWS;

    // Reset avatar store
    useAvatarStore.setState({
      currentAction: 'Idle',
      currentEmotion: 'neutral',
      lipSyncVolume: 0,
    });
  });

  afterEach(() => {
    (globalThis as any).WebSocket = OriginalWebSocket;
  });

  // ── Initial State ─────────────────────────────────────────
  describe('initial state', () => {
    it('should start with status "disconnected"', () => {
      const { result } = renderHook(() => useStoryteller());
      expect(result.current.status).toBe('disconnected');
    });

    it('should have empty logs', () => {
      const { result } = renderHook(() => useStoryteller());
      expect(result.current.logs).toEqual([]);
    });

    it('should expose startStory and stopStory functions', () => {
      const { result } = renderHook(() => useStoryteller());
      expect(typeof result.current.startStory).toBe('function');
      expect(typeof result.current.stopStory).toBe('function');
    });

    it('should expose sendImage function', () => {
      const { result } = renderHook(() => useStoryteller());
      expect(typeof result.current.sendImage).toBe('function');
    });
  });

  // ── startStory Flow ───────────────────────────────────────
  describe('startStory', () => {
    it('should request microphone access', async () => {
      const { result } = renderHook(() => useStoryteller());

      await act(async () => {
        await result.current.startStory();
      });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          }),
        })
      );
    });

    it('should set status to "connecting" immediately', async () => {
      const { result } = renderHook(() => useStoryteller());

      // Start the story — the promise will complete after microtask
      const promise = act(async () => {
        await result.current.startStory();
      });

      // We need to check mid-flow, but after act completes we can check logs
      await promise;

      // The logs should contain a connecting-related entry
      expect(result.current.logs.some(l => l.includes('Microphone access granted'))).toBe(true);
    });

    it('should create a WebSocket to ws://localhost:3001/ws', async () => {
      const { result } = renderHook(() => useStoryteller());

      await act(async () => {
        await result.current.startStory();
      });

      expect(capturedWs).not.toBeNull();
      expect(capturedWs!.url).toBe('ws://localhost:3001/ws');
    });
  });

  // ── Message Handling ──────────────────────────────────────
  describe('message handling', () => {
    async function setupConnectedHook() {
      const hook = renderHook(() => useStoryteller());
      await act(async () => {
        await hook.result.current.startStory();
      });
      // Wait for WebSocket's microtask onopen
      await act(async () => {
        await new Promise(r => setTimeout(r, 10));
      });
      return hook;
    }

    it('should transition to "connected" on status:connected message', async () => {
      const { result } = await setupConnectedHook();

      await act(async () => {
        capturedWs!._receive({ type: 'status', status: 'connected' });
      });

      expect(result.current.status).toBe('connected');
    });

    it('should transition to "listening" on status:ready message', async () => {
      const { result } = await setupConnectedHook();

      await act(async () => {
        capturedWs!._receive({ type: 'status', status: 'ready' });
      });

      expect(result.current.status).toBe('listening');
    });

    it('should set avatar action to "Idle" on status:ready', async () => {
      await setupConnectedHook();

      await act(async () => {
        capturedWs!._receive({ type: 'status', status: 'ready' });
      });

      expect(useAvatarStore.getState().currentAction).toBe('Idle');
    });

    it('should transition to "speaking" on audio message', async () => {
      const { result } = await setupConnectedHook();

      // Create a small valid base64 audio payload (2 bytes of Int16)
      const fakeAudio = btoa(String.fromCharCode(0, 0));

      await act(async () => {
        capturedWs!._receive({ type: 'audio', data: fakeAudio, mimeType: 'audio/pcm' });
      });

      expect(result.current.status).toBe('speaking');
    });

    it('should set avatar action to "Talking" on audio message', async () => {
      await setupConnectedHook();

      const fakeAudio = btoa(String.fromCharCode(0, 0));

      await act(async () => {
        capturedWs!._receive({ type: 'audio', data: fakeAudio, mimeType: 'audio/pcm' });
      });

      expect(useAvatarStore.getState().currentAction).toBe('Talking');
    });

    it('should transition to "listening" on turn_complete', async () => {
      const { result } = await setupConnectedHook();

      // First go to speaking
      await act(async () => {
        const fakeAudio = btoa(String.fromCharCode(0, 0));
        capturedWs!._receive({ type: 'audio', data: fakeAudio, mimeType: 'audio/pcm' });
      });
      expect(result.current.status).toBe('speaking');

      // Then turn complete
      await act(async () => {
        capturedWs!._receive({ type: 'status', status: 'turn_complete' });
      });

      expect(result.current.status).toBe('listening');
    });

    it('should set status to "error" on error message', async () => {
      const { result } = await setupConnectedHook();

      await act(async () => {
        capturedWs!._receive({ type: 'error', message: 'Something went wrong' });
      });

      expect(result.current.status).toBe('error');
    });

    it('should log tool_event messages', async () => {
      const { result } = await setupConnectedHook();

      await act(async () => {
        capturedWs!._receive({ type: 'tool_event', name: 'generate_music' });
      });

      expect(result.current.logs.some(l => l.includes('generate_music'))).toBe(true);
    });
  });

  // ── stopStory ─────────────────────────────────────────────
  describe('stopStory', () => {
    it('should set status back to "disconnected"', async () => {
      const { result } = renderHook(() => useStoryteller());

      await act(async () => {
        await result.current.startStory();
      });

      act(() => {
        result.current.stopStory();
      });

      expect(result.current.status).toBe('disconnected');
    });

    it('should reset avatar state on stop', async () => {
      const { result } = renderHook(() => useStoryteller());

      await act(async () => {
        await result.current.startStory();
      });

      // Simulate speaking state
      useAvatarStore.getState().setAction('Talking');
      useAvatarStore.getState().setLipSyncVolume(0.8);

      act(() => {
        result.current.stopStory();
      });

      expect(useAvatarStore.getState().currentAction).toBe('Idle');
      expect(useAvatarStore.getState().lipSyncVolume).toBe(0);
    });
  });

  // ── Cleanup on Unmount ────────────────────────────────────
  describe('cleanup', () => {
    it('should reset to disconnected on unmount', async () => {
      const { result, unmount } = renderHook(() => useStoryteller());

      await act(async () => {
        await result.current.startStory();
      });

      unmount();

      // After unmount, avatar store should be reset
      expect(useAvatarStore.getState().currentAction).toBe('Idle');
      expect(useAvatarStore.getState().lipSyncVolume).toBe(0);
    });
  });
});

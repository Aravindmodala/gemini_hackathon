/**
 * Integration test — App + useStoryteller + Zustand store.
 *
 * Tests the full component tree interaction without mocking the hook,
 * verifying that UI interactions trigger the correct state changes
 * through the real hook wiring (with browser APIs still mocked).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '../App';
import { useAvatarStore } from '../store/useAvatarStore';

// Helper: flush microtask queue + allow timers to fire
const flushAsync = () => act(async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 0));
  }
});

// ── Trackable WS mock (must be a real class for Vitest 4.x compat) ──
interface TrackedWS {
  url: string;
  close: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  readyState: number;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
}

let wsInstances: TrackedWS[];

// Keep a reference to the original WebSocket (from setup.ts mock)
const OriginalMockWS = globalThis.WebSocket;

describe('App Integration', () => {
  beforeEach(() => {
    wsInstances = [];

    // Use a proper class so `new WebSocket(url)` works in Vitest 4.x.
    // vi.fn().mockImplementation() is NOT a valid constructor in Vitest 4.x.
    class TrackingWebSocket {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;

      url: string;
      readyState = 0;
      onopen: ((ev: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      onclose: ((ev: CloseEvent) => void) | null = null;
      send = vi.fn();
      close = vi.fn().mockImplementation(() => {
        this.readyState = 3;
        this.onclose?.(new CloseEvent('close'));
      });

      constructor(url: string) {
        this.url = url;
        wsInstances.push(this);

        // Auto-connect after microtask
        queueMicrotask(() => {
          this.readyState = 1; // OPEN
          this.onopen?.(new Event('open'));
        });
      }
    }

    (globalThis as any).WebSocket = TrackingWebSocket;

    // Reset avatar store
    useAvatarStore.setState({
      currentAction: 'Idle',
      currentEmotion: 'neutral',
      lipSyncVolume: 0,
    });
  });

  afterEach(() => {
    // Restore WebSocket to the original setup.ts mock.
    // Do NOT call vi.restoreAllMocks() — it would also restore the global
    // getUserMedia / AudioContext mocks from setup.ts, breaking later tests.
    (globalThis as any).WebSocket = OriginalMockWS;
  });

  // ── Initial Render ────────────────────────────────────────
  it('should render the app with all expected elements', () => {
    render(<App />);

    expect(screen.getByText('The Emotional Chronicler')).toBeInTheDocument();
    expect(screen.getByText('Immersive AI Storytelling')).toBeInTheDocument();
    expect(screen.getByText('DISCONNECTED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /talk to elora/i })).toBeInTheDocument();
  });

  // ── Start Story Flow ──────────────────────────────────────
  it('should create WebSocket when "Talk to Elora" is clicked', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /talk to elora/i }));
    });

    // Flush the full async chain: getUserMedia → AudioContext → WebSocket
    await flushAsync();

    expect(wsInstances.length).toBe(1);
    expect(wsInstances[0].url).toBe('ws://localhost:3001/ws');
  });

  // ── Emotion Controls + Store ──────────────────────────────
  it('should update avatar store when emotion buttons are clicked', async () => {
    render(<App />);

    expect(useAvatarStore.getState().currentEmotion).toBe('neutral');

    await act(async () => {
      fireEvent.click(screen.getByText('😊'));
    });
    expect(useAvatarStore.getState().currentEmotion).toBe('happy');

    await act(async () => {
      fireEvent.click(screen.getByText('😢'));
    });
    expect(useAvatarStore.getState().currentEmotion).toBe('sad');

    await act(async () => {
      fireEvent.click(screen.getByText('😲'));
    });
    expect(useAvatarStore.getState().currentEmotion).toBe('surprised');

    await act(async () => {
      fireEvent.click(screen.getByText('😐'));
    });
    expect(useAvatarStore.getState().currentEmotion).toBe('neutral');
  });

  // ── Server Message → UI Update ────────────────────────────
  it('should update UI when server sends "ready" status', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /talk to elora/i }));
    });

    await flushAsync();

    // Simulate server sending "connected" + "ready"
    await act(async () => {
      wsInstances[0].onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'status', status: 'connected' }),
      }));
    });

    await act(async () => {
      wsInstances[0].onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'status', status: 'ready' }),
      }));
    });

    expect(screen.getByText('LISTENING')).toBeInTheDocument();
  });

  // ── WebSocket URL Correctness ─────────────────────────────
  it('should connect to the correct backend WebSocket endpoint', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /talk to elora/i }));
    });

    await flushAsync();

    expect(wsInstances[0].url).toMatch(/^ws:\/\/localhost:3001\/ws/);
  });
});

/**
 * Global test setup for Vitest + jsdom.
 *
 * Mocks browser APIs that don't exist in jsdom:
 *   - WebSocket, AudioContext, MediaDevices, requestAnimationFrame
 *   - HTMLCanvasElement.getContext (needed by Three.js / R3F)
 */
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// ── WebSocket Mock ──────────────────────────────────────────
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;

  // Track sent messages for assertions
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    // Auto-open after microtask so tests can attach handlers
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    });
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  // Helper: simulate a message from the server
  _receive(data: Record<string, unknown>) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }
}

// Expose to global
Object.defineProperty(globalThis, 'WebSocket', { value: MockWebSocket, writable: true });

// ── AudioContext Mock ───────────────────────────────────────
class MockAnalyserNode {
  fftSize = 512;
  frequencyBinCount = 256;
  connect = vi.fn().mockReturnThis();
  disconnect = vi.fn();
  getByteFrequencyData = vi.fn((arr: Uint8Array) => arr.fill(0));
}

class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  connect = vi.fn().mockReturnThis();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class MockScriptProcessorNode {
  onaudioprocess: ((ev: AudioProcessingEvent) => void) | null = null;
  connect = vi.fn().mockReturnThis();
  disconnect = vi.fn();
}

class MockMediaStreamSourceNode {
  connect = vi.fn().mockReturnThis();
  disconnect = vi.fn();
}

class MockAudioContext {
  sampleRate = 48000;
  currentTime = 0;
  state = 'running';
  destination = {};

  createAnalyser = vi.fn(() => new MockAnalyserNode());
  createBufferSource = vi.fn(() => new MockAudioBufferSourceNode());
  createScriptProcessor = vi.fn(() => new MockScriptProcessorNode());
  createMediaStreamSource = vi.fn(() => new MockMediaStreamSourceNode());
  createBuffer = vi.fn((_channels: number, length: number, sampleRate: number) => ({
    duration: length / sampleRate,
    getChannelData: vi.fn(() => new Float32Array(length)),
    numberOfChannels: 1,
    length,
    sampleRate,
  }));
  close = vi.fn(() => Promise.resolve());
  resume = vi.fn(() => Promise.resolve());
  suspend = vi.fn(() => Promise.resolve());
}

Object.defineProperty(globalThis, 'AudioContext', { value: MockAudioContext, writable: true });
Object.defineProperty(globalThis, 'webkitAudioContext', { value: MockAudioContext, writable: true });

// ── MediaDevices Mock ───────────────────────────────────────
const mockMediaStream = {
  getTracks: () => [{ stop: vi.fn(), kind: 'audio', enabled: true }],
  getAudioTracks: () => [{ stop: vi.fn(), kind: 'audio', enabled: true }],
};

Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn(() => Promise.resolve(mockMediaStream)),
    enumerateDevices: vi.fn(() => Promise.resolve([])),
  },
  writable: true,
});

// ── requestAnimationFrame / cancelAnimationFrame ────────────
let rafId = 0;
globalThis.requestAnimationFrame = vi.fn((_cb: FrameRequestCallback) => {
  rafId++;
  // Don't auto-invoke to avoid infinite loops in tests
  return rafId;
});
globalThis.cancelAnimationFrame = vi.fn();

// ── HTMLCanvasElement.getContext (Three.js needs this) ───────
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  canvas: { width: 800, height: 600 },
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  putImageData: vi.fn(),
  createImageData: vi.fn(),
  setTransform: vi.fn(),
  resetTransform: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  scale: vi.fn(),
  translate: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  arc: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
}) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// ── URL.createObjectURL (used by GLTFLoader) ────────────────
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock');
}
if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = vi.fn();
}

// ── atob / btoa (some jsdom environments miss these) ────────
// These are typically available in jsdom, only provide fallback if missing
if (typeof globalThis.atob !== 'function') {
  globalThis.atob = (str: string) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    for (let i = 0; i < str.length; i += 4) {
      const a = chars.indexOf(str[i]), b = chars.indexOf(str[i + 1]);
      const c = chars.indexOf(str[i + 2]), d = chars.indexOf(str[i + 3]);
      output += String.fromCharCode((a << 2) | (b >> 4));
      if (c !== 64) output += String.fromCharCode(((b & 15) << 4) | (c >> 2));
      if (d !== 64) output += String.fromCharCode(((c & 3) << 6) | d);
    }
    return output;
  };
}
if (typeof globalThis.btoa !== 'function') {
  globalThis.btoa = (str: string) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    for (let i = 0; i < str.length; i += 3) {
      const a = str.charCodeAt(i), b = str.charCodeAt(i + 1), c = str.charCodeAt(i + 2);
      output += chars[(a >> 2) & 63] + chars[((a & 3) << 4) | ((b >> 4) & 15)];
      output += isNaN(b) ? '==' : chars[((b & 15) << 2) | ((c >> 6) & 3)] + (isNaN(c) ? '=' : chars[c & 63]);
    }
    return output;
  };
}

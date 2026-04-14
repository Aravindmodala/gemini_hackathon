/**
 * Integration tests — App + useStoryteller + BookView + AvatarHUD.
 *
 * Tests the full component tree with real hooks but mocked fetch/Audio,
 * verifying that SSE events flow through and update the UI correctly.
 *
 * NOTE: Scene component was intentionally removed from App.tsx in favour of
 * the 3D CSS Book interface. Tests updated accordingly.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '../App';

// ── Mock external dependencies ────────────────────────────────────────────────

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      uid: 'test-uid',
      email: 'test@test.com',
      displayName: 'Test User',
      photoURL: null,
    },
    loading: false,
    signOut: vi.fn(),
    getIdToken: vi.fn().mockResolvedValue('mock-token'),
    signInWithGoogle: vi.fn(),
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const getSessionDetailMock = vi.fn().mockResolvedValue({ interactions: [] });

vi.mock('../hooks/useSessions', () => ({
  useSessions: () => ({
    sessions: [],
    loading: false,
    error: null,
    fetchSessions: vi.fn(),
    getSessionDetail: getSessionDetailMock,
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
  }),
}));

// ── Mock Audio ────────────────────────────────────────────────────────────────

class MockAudio {
  src: string;
  volume = 1;
  onended: (() => void) | null = null;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  constructor(src: string) { this.src = src; }
}
vi.stubGlobal('Audio', MockAudio);

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseData(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function makeSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(events.join('')));
      controller.close();
    },
  });
}

function mockFetchSSE(events: string[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: makeSSEStream(events),
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('App Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Audio', MockAudio);
    getSessionDetailMock.mockResolvedValue({ interactions: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('Audio', MockAudio);
  });

  // ── Initial render ────────────────────────────────────────────────────────

  it('renders title and empty state for authenticated user', () => {
    mockFetchSSE([]);
    render(<App />);

    // Title badge appears in top-left header
    expect(screen.getByText('The Emotional Chronicler')).toBeInTheDocument();
    // Story prompt is visible on idle state
    expect(screen.getByRole('button', { name: /begin the story/i })).toBeInTheDocument();
  });

  it('shows the story prompt on initial render', () => {
    mockFetchSSE([]);
    render(<App />);

    expect(screen.getByRole('button', { name: /begin the story/i })).toBeInTheDocument();
  });

  it('sidebar renders user info and controls', () => {
    mockFetchSSE([]);
    render(<App />);

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('New Story')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  // ── Story generation flow ─────────────────────────────────────────────────

  it('shows generating status after submitting a prompt', async () => {
    // Fetch that never resolves — keeps hook in "generating"
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));
    render(<App />);

    const textarea = screen.getByPlaceholderText(/describe a story/i);
    fireEvent.change(textarea, { target: { value: 'A dragon story' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /begin the story/i }));
    });

    // Prompt should hide (disabled / not shown while generating)
    expect(screen.queryByRole('button', { name: /begin the story/i })).not.toBeInTheDocument();
    // AvatarHUD Stop button appears
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
  });

  it('renders streamed text in BookView', async () => {
    mockFetchSSE([
      sseData({ type: 'text', chunk: 'Once upon a time in a magical land' }),
      sseData({ type: 'done' }),
    ]);

    render(<App />);

    const textarea = screen.getByPlaceholderText(/describe a story/i);
    fireEvent.change(textarea, { target: { value: 'A story' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /begin the story/i }));
    });

    // Wait for SSE to complete
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(screen.getByText('Once upon a time in a magical land')).toBeInTheDocument();
  });

  it('shows New Story button after story completes', async () => {
    mockFetchSSE([
      sseData({ type: 'text', chunk: 'The end.' }),
      sseData({ type: 'done' }),
    ]);

    render(<App />);

    const textarea = screen.getByPlaceholderText(/describe a story/i);
    fireEvent.change(textarea, { target: { value: 'Quick tale' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /begin the story/i }));
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(screen.getByRole('button', { name: /new story/i })).toBeInTheDocument();
  });

  it('stop button aborts generation and returns to idle', async () => {
    // Fetch that never resolves
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));
    render(<App />);

    const textarea = screen.getByPlaceholderText(/describe a story/i);
    fireEvent.change(textarea, { target: { value: 'A story' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /begin the story/i }));
    });

    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    });

    // After stop, back to idle — prompt should show again
    expect(screen.getByRole('button', { name: /begin the story/i })).toBeInTheDocument();
  });

  it('renders image section in BookView', async () => {
    mockFetchSSE([
      sseData({ type: 'text', chunk: 'The dragon appeared.' }),
      sseData({ type: 'image', url: '/api/images/dragon.png', caption: 'A fierce dragon' }),
      sseData({ type: 'done' }),
    ]);

    render(<App />);

    const textarea = screen.getByPlaceholderText(/describe a story/i);
    fireEvent.change(textarea, { target: { value: 'Dragon story' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /begin the story/i }));
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    const img = screen.getByAltText('A fierce dragon');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/api/images/dragon.png');
  });

  it('hydrates saved session with formatted text and image', async () => {
    getSessionDetailMock.mockResolvedValueOnce({
      title: 'Saved Chronicle',
      interactions: [
        { text: 'Saved story intro\n\nContinues here.' },
        {
          role: 'tool',
          name: 'inline_image',
          args: { image_url: '/api/images/hero.png', caption: 'Home hero' },
        },
      ],
    });
    window.history.replaceState({}, '', '/story/saved');

    render(<App />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });

    expect(screen.getByText('Saved story intro')).toBeInTheDocument();
    expect(screen.getByText('Continues here.')).toBeInTheDocument();
    const intro = screen.getByText('Saved story intro');
    const savedImg = screen.getByAltText('Home hero');
    expect(savedImg).toBeInTheDocument();
    expect(intro.compareDocumentPosition(savedImg) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    window.history.replaceState({}, '', '/');
  });

  it('hydrates saved session image from generated_image tool interactions', async () => {
    getSessionDetailMock.mockResolvedValueOnce({
      title: 'Generated Session',
      interactions: [
        { text: 'Generated intro.' },
        {
          role: 'tool',
          name: 'generated_image',
          args: { image_url: '/api/images/generated.png', caption: 'Generated visual' },
        },
      ],
    });
    window.history.replaceState({}, '', '/story/generated');

    render(<App />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });

    const generatedImg = screen.getByAltText('Generated visual');
    expect(generatedImg).toBeInTheDocument();
    expect(generatedImg).toHaveAttribute('src', '/api/images/generated.png');
    window.history.replaceState({}, '', '/');
  });

  // ── New Story resets the view ─────────────────────────────────────────────

  it('clicking New Story in sidebar resets to idle with prompt visible', async () => {
    mockFetchSSE([
      sseData({ type: 'text', chunk: 'The end.' }),
      sseData({ type: 'done' }),
    ]);

    render(<App />);

    const textarea = screen.getByPlaceholderText(/describe a story/i);
    fireEvent.change(textarea, { target: { value: 'A story' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /begin the story/i }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });

    // Now in done state — click New Story in sidebar
    const newStoryBtns = screen.getAllByText('New Story');
    await act(async () => {
      fireEvent.click(newStoryBtns[0]);
    });

    // Should be back to idle with prompt
    expect(screen.getByRole('button', { name: /begin the story/i })).toBeInTheDocument();
  });

  // ── Auth token is sent in story request ───────────────────────────────────

  it('includes Authorization header when user is authenticated', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: makeSSEStream([sseData({ type: 'done' })]),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    const textarea = screen.getByPlaceholderText(/describe a story/i);
    fireEvent.change(textarea, { target: { value: 'A story' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /begin the story/i }));
    });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toMatch(/^Bearer /);
  });
});

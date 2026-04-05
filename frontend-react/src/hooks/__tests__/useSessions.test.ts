import { act, renderHook, waitFor } from '@testing-library/react';

const mockGetIdToken = vi.fn().mockResolvedValue('mock-token');
const authState = {
  getIdToken: mockGetIdToken,
  user: { uid: 'user-1' },
  loading: false,
};

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

import { useSessions } from '../../hooks/useSessions';

const mockFetch = vi.fn();

describe('useSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;
    authState.user = { uid: 'user-1' };
    authState.loading = false;

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches sessions on mount when auth is ready', async () => {
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetIdToken).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/sessions'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer mock-token' },
      })
    );
  });

  it('returns sessions from data.data', async () => {
    const fakeSessions = [
      {
        session_id: 's1',
        title: 'Story 1',
        status: 'active',
        created_at: null,
        updated_at: null,
        interaction_count: 0,
        preview: '',
      },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: fakeSessions }),
    });

    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.sessions).toEqual(fakeSessions);
  });

  it('clears sessions when user is signed out', async () => {
    authState.user = null;

    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.sessions).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('deleteSession removes the session locally on success', async () => {
    const fakeSessions = [
      {
        session_id: 's1',
        title: 'Story 1',
        status: 'active',
        created_at: null,
        updated_at: null,
        interaction_count: 0,
        preview: '',
      },
      {
        session_id: 's2',
        title: 'Story 2',
        status: 'active',
        created_at: null,
        updated_at: null,
        interaction_count: 0,
        preview: '',
      },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: fakeSessions }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
    });

    await act(async () => {
      await result.current.deleteSession('s1');
    });

    expect(result.current.sessions.map(s => s.session_id)).toEqual(['s2']);
  });

  it('renameSession updates local session title on success', async () => {
    const fakeSessions = [
      {
        session_id: 's1',
        title: 'Old Title',
        status: 'active',
        created_at: null,
        updated_at: null,
        interaction_count: 0,
        preview: '',
      },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: fakeSessions }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    await act(async () => {
      await result.current.renameSession('s1', 'New Title');
    });

    expect(result.current.sessions[0].title).toBe('New Title');
  });

  it('getSessionDetail returns data.data', async () => {
    const detail = {
      session_id: 's1',
      title: 'Story 1',
      status: 'active',
      created_at: null,
      updated_at: null,
      interaction_count: 1,
      preview: 'Hello',
      interactions: [{ role: 'user', text: 'Hello', timestamp: '2026-01-01T00:00:00Z' }],
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: detail }) });

    const { result } = renderHook(() => useSessions());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let response;
    await act(async () => {
      response = await result.current.getSessionDetail('s1');
    });

    expect(response).toEqual(detail);
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/v1/sessions/s1'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer mock-token' },
      })
    );
  });

  it('updateSessionInState patches only the matching session', async () => {
    const fakeSessions = [
      {
        session_id: 's1',
        title: 'Untitled Story',
        status: 'active',
        created_at: null,
        updated_at: null,
        interaction_count: 0,
        preview: '',
      },
      {
        session_id: 's2',
        title: 'Already Titled',
        status: 'active',
        created_at: null,
        updated_at: null,
        interaction_count: 0,
        preview: '',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: fakeSessions }),
    });

    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
    });

    act(() => {
      result.current.updateSessionInState('s1', { title: 'Mosquito Man Rising' });
    });

    expect(result.current.sessions.find(s => s.session_id === 's1')?.title).toBe('Mosquito Man Rising');
    expect(result.current.sessions.find(s => s.session_id === 's2')?.title).toBe('Already Titled');
  });

  it('updateSessionInState inserts a placeholder row when the session is missing', async () => {
    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateSessionInState('live-session-1', { title: 'Fresh Title' });
    });

    expect(result.current.sessions[0]).toMatchObject({
      session_id: 'live-session-1',
      title: 'Fresh Title',
      status: 'active',
      interaction_count: 0,
      preview: '',
    });
  });

  it('fetchSessions preserves a locally generated title over stale fetched Untitled data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    const { result } = renderHook(() => useSessions());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateSessionInState('live-session-2', { title: 'Mosquito Man Rising' });
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              session_id: 'live-session-2',
              title: 'Untitled Story',
              status: 'active',
              created_at: null,
              updated_at: null,
              interaction_count: 1,
              preview: 'Opening line',
            },
          ],
        }),
    });

    await act(async () => {
      await result.current.fetchSessions();
    });

    expect(result.current.sessions[0]).toMatchObject({
      session_id: 'live-session-2',
      title: 'Mosquito Man Rising',
      preview: 'Opening line',
      interaction_count: 1,
    });
  });
});

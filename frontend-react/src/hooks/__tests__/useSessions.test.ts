/**
 * Unit tests for the useSessions hook.
 *
 * Tests REST API interactions for fetching, deleting, and renaming sessions.
 * Uses mocked fetch and mocked useAuth.
 */
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Mock useAuth ────────────────────────────────────────────
const mockGetIdToken = vi.fn().mockResolvedValue('mock-token');

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    getIdToken: mockGetIdToken,
  }),
}));

// Import after mocks are set up
import { useSessions } from '../../hooks/useSessions';

// ── Mock fetch ──────────────────────────────────────────────
const mockFetch = vi.fn();

describe('useSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;

    // Default: fetchSessions returns empty list
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessions: [] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Initial Fetch ───────────────────────────────────────────
  describe('initial fetch', () => {
    it('should fetch sessions on mount', async () => {
      const { result } = renderHook(() => useSessions());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockGetIdToken).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer mock-token' },
        }),
      );
    });

    it('should return sessions array', async () => {
      const fakeSessions = [
        { session_id: 's1', title: 'Story 1', status: 'active', created_at: null, updated_at: null, interaction_count: 0, preview: '' },
        { session_id: 's2', title: 'Story 2', status: 'ended', created_at: null, updated_at: null, interaction_count: 3, preview: 'Hello' },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ sessions: fakeSessions }),
      });

      const { result } = renderHook(() => useSessions());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.sessions).toEqual(fakeSessions);
    });

    it('should set loading=true initially then false after fetch', async () => {
      const { result } = renderHook(() => useSessions());

      // Initially loading
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('should set error on fetch failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      const { result } = renderHook(() => useSessions());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to fetch sessions');
    });

    it('should set error on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useSessions());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
    });
  });

  // ── deleteSession ───────────────────────────────────────────
  describe('deleteSession', () => {
    it('should remove session from list on successful delete', async () => {
      const fakeSessions = [
        { session_id: 's1', title: 'Story 1', status: 'active', created_at: null, updated_at: null, interaction_count: 0, preview: '' },
        { session_id: 's2', title: 'Story 2', status: 'active', created_at: null, updated_at: null, interaction_count: 0, preview: '' },
      ];

      // First call: fetchSessions, second call: deleteSession
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessions: fakeSessions }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const { result } = renderHook(() => useSessions());

      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(2);
      });

      await act(async () => {
        await result.current.deleteSession('s1');
      });

      expect(result.current.sessions).toHaveLength(1);
      expect(result.current.sessions[0].session_id).toBe('s2');
    });

    it('should call DELETE endpoint with correct URL and auth header', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessions: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const { result } = renderHook(() => useSessions());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.deleteSession('sess-42');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions/sess-42'),
        expect.objectContaining({
          method: 'DELETE',
          headers: { Authorization: 'Bearer mock-token' },
        }),
      );
    });

    it('should set error on delete failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessions: [] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({}),
        });

      const { result } = renderHook(() => useSessions());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.deleteSession('sess-42');
      });

      expect(result.current.error).toBe('Failed to delete session');
    });
  });

  // ── renameSession ───────────────────────────────────────────
  describe('renameSession', () => {
    it('should update session title in list on successful rename', async () => {
      const fakeSessions = [
        { session_id: 's1', title: 'Old Title', status: 'active', created_at: null, updated_at: null, interaction_count: 0, preview: '' },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessions: fakeSessions }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const { result } = renderHook(() => useSessions());

      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(1);
      });

      await act(async () => {
        await result.current.renameSession('s1', 'New Title');
      });

      expect(result.current.sessions[0].title).toBe('New Title');
    });

    it('should call PATCH endpoint with correct URL, auth header, and body', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessions: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const { result } = renderHook(() => useSessions());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.renameSession('sess-42', 'New Name');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions/sess-42'),
        expect.objectContaining({
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer mock-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title: 'New Name' }),
        }),
      );
    });

    it('should set error on rename failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessions: [] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({}),
        });

      const { result } = renderHook(() => useSessions());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.renameSession('sess-42', 'New Name');
      });

      expect(result.current.error).toBe('Failed to rename session');
    });
  });

  // ── fetchSessions (manual refresh) ──────────────────────────
  describe('fetchSessions', () => {
    it('should refresh the session list', async () => {
      const initialSessions = [
        { session_id: 's1', title: 'Story 1', status: 'active', created_at: null, updated_at: null, interaction_count: 0, preview: '' },
      ];
      const updatedSessions = [
        { session_id: 's1', title: 'Story 1', status: 'active', created_at: null, updated_at: null, interaction_count: 0, preview: '' },
        { session_id: 's2', title: 'Story 2', status: 'active', created_at: null, updated_at: null, interaction_count: 0, preview: '' },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessions: initialSessions }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessions: updatedSessions }),
        });

      const { result } = renderHook(() => useSessions());

      await waitFor(() => {
        expect(result.current.sessions).toHaveLength(1);
      });

      await act(async () => {
        await result.current.fetchSessions();
      });

      expect(result.current.sessions).toHaveLength(2);
    });
  });

  describe('getSessionDetail', () => {
    it('should return session detail on success', async () => {
      const detail = {
        session_id: 's1',
        title: 'Story 1',
        status: 'active',
        created_at: null,
        updated_at: null,
        interactions: [
          { role: 'user', text: 'Hello', timestamp: '2026-01-01T00:00:00Z' },
        ],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessions: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(detail),
        });

      const { result } = renderHook(() => useSessions());

      await waitFor(() => expect(result.current.loading).toBe(false));

      let response: unknown;
      await act(async () => {
        response = await result.current.getSessionDetail('s1');
      });

      expect(response).toEqual(detail);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions/s1'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer mock-token' },
        }),
      );
    });

    it('should set error and reject on failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ sessions: [] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({}),
        });

      const { result } = renderHook(() => useSessions());

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await expect(result.current.getSessionDetail('missing')).rejects.toThrow('Failed to fetch session detail');
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch session detail');
      });

      expect(result.current.error).toBe('Failed to fetch session detail');
    });
  });
});

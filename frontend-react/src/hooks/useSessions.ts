import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config/api';
import type { Session, SessionDetail } from '../types/session';

const SESSIONS_KEY = ['sessions'] as const;
const SESSION_DETAIL_KEY = (id: string) => ['sessions', id] as const;

function useAuthFetch() {
  const { getIdToken } = useAuth();

  return useCallback(
    async (input: string, init?: RequestInit): Promise<Response> => {
      let token = await getIdToken();
      let res = await fetch(input, {
        ...init,
        headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        const TOKEN_REFRESH_DELAY_MS = 1200;
        await new Promise(resolve => setTimeout(resolve, TOKEN_REFRESH_DELAY_MS));
        token = await getIdToken(true);
        res = await fetch(input, {
          ...init,
          headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` },
        });
      }

      return res;
    },
    [getIdToken],
  );
}

export function useSessions() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const authFetch = useAuthFetch();

  const {
    data: rawSessions,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: [...SESSIONS_KEY],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/api/v1/sessions`);
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const json = await res.json();
      const incoming: Session[] = Array.isArray(json.data) ? json.data : [];

      const currentSessions = queryClient.getQueryData<Session[]>([...SESSIONS_KEY]) ?? [];
      const prevById = new Map(currentSessions.map(s => [s.session_id, s]));

      const merged = incoming.map((session) => {
        const existing = prevById.get(session.session_id);
        if (!existing) return session;

        const shouldPreserveLocalTitle =
          (session.title === 'Untitled Story' || !session.title) &&
          existing.title &&
          existing.title !== 'Untitled Story';

        return shouldPreserveLocalTitle
          ? { ...session, title: existing.title, updated_at: existing.updated_at ?? session.updated_at }
          : session;
      });

      const incomingIds = new Set(merged.map(s => s.session_id));
      const localOnly = currentSessions.filter(s => !incomingIds.has(s.session_id));
      return [...localOnly, ...merged];
    },
    enabled: !authLoading && !!user,
  });

  const sessions = rawSessions ?? [];
  const loading = authLoading || isLoading;
  const error = queryError ? (queryError as Error).message : null;

  /* ── Delete mutation ─────────────────────────────────────── */

  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await authFetch(`${API_BASE}/api/v1/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete session');
      return sessionId;
    },
    onSuccess: (sessionId) => {
      queryClient.setQueryData<Session[]>([...SESSIONS_KEY], (old) =>
        (old ?? []).filter(s => s.session_id !== sessionId),
      );
    },
  });

  const { mutateAsync: deleteMutateAsync } = deleteMutation;
  const deleteSession = useCallback(
    (sessionId: string) => deleteMutateAsync(sessionId),
    [deleteMutateAsync],
  );

  /* ── Rename mutation (optimistic) ────────────────────────── */

  const renameMutation = useMutation({
    mutationFn: async ({ sessionId, title }: { sessionId: string; title: string }) => {
      const res = await authFetch(`${API_BASE}/api/v1/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error('Failed to rename session');
    },
    onMutate: async ({ sessionId, title }) => {
      await queryClient.cancelQueries({ queryKey: [...SESSIONS_KEY] });
      const previous = queryClient.getQueryData<Session[]>([...SESSIONS_KEY]);
      queryClient.setQueryData<Session[]>([...SESSIONS_KEY], (old) =>
        (old ?? []).map(s => (s.session_id === sessionId ? { ...s, title } : s)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData([...SESSIONS_KEY], ctx?.previous);
    },
  });

  const { mutateAsync: renameMutateAsync } = renameMutation;
  const renameSession = useCallback(
    (sessionId: string, title: string) => renameMutateAsync({ sessionId, title }),
    [renameMutateAsync],
  );

  /* ── Imperative session detail fetch ─────────────────────── */

  const getSessionDetail = useCallback(
    async (sessionId: string): Promise<SessionDetail> => {
      const res = await authFetch(`${API_BASE}/api/v1/sessions/${sessionId}`);
      if (!res.ok) throw new Error('Failed to fetch session detail');
      const json = await res.json();
      return json.data as SessionDetail;
    },
    [authFetch],
  );

  /* ── Direct cache update (used by SSE title / thumbnail) ── */

  const updateSessionInState = useCallback(
    (sessionId: string, patch: Partial<Session>) => {
      queryClient.setQueryData<Session[]>([...SESSIONS_KEY], (old) => {
        const list = old ?? [];
        const existing = list.find(s => s.session_id === sessionId);
        if (existing) {
          return list.map(s => (s.session_id === sessionId ? { ...s, ...patch } : s));
        }
        const now = new Date().toISOString();
        const placeholder: Session = {
          session_id: sessionId,
          title: typeof patch.title === 'string' ? patch.title : 'Untitled Story',
          status: patch.status ?? 'active',
          created_at: patch.created_at ?? now,
          updated_at: patch.updated_at ?? now,
          interaction_count: patch.interaction_count ?? 0,
          preview: patch.preview ?? '',
        };
        return [placeholder, ...list];
      });
    },
    [queryClient],
  );

  /* ── Compatibility shim for imperative refresh ───────────── */

  const fetchSessions = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [...SESSIONS_KEY] });
  }, [queryClient]);

  return {
    sessions,
    loading,
    error,
    fetchSessions,
    getSessionDetail,
    deleteSession,
    renameSession,
    updateSessionInState,
  };
}

/* ── Standalone hook for session detail queries ────────────── */

export function useSessionDetail(sessionId: string | null) {
  const { user } = useAuth();
  const authFetch = useAuthFetch();

  return useQuery({
    queryKey: SESSION_DETAIL_KEY(sessionId ?? ''),
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/api/v1/sessions/${sessionId}`);
      if (!res.ok) throw new Error('Failed to fetch session detail');
      const json = await res.json();
      return json.data as SessionDetail;
    },
    enabled: !!sessionId && !!user,
    staleTime: 5 * 60 * 1000,
  });
}

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config/api';
import type { Session, SessionDetail } from '../types/session';

export function useSessions() {
  const { getIdToken, user, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const fetchWithAuthRetry = useCallback(
    async (input: string, init?: RequestInit): Promise<Response> => {
      let token = await getIdToken();
      let res = await fetch(input, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        await wait(1200);
        token = await getIdToken(true);
        res = await fetch(input, {
          ...init,
          headers: {
            ...(init?.headers || {}),
            Authorization: `Bearer ${token}`,
          },
        });
      }

      return res;
    },
    [getIdToken]
  );

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchWithAuthRetry(`${API_BASE}/api/v1/sessions`);
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();
      setSessions(prev => {
        const incoming = Array.isArray(data.data) ? data.data : [];
        const prevById = new Map(prev.map(session => [session.session_id, session]));

        const merged = incoming.map((session: Session) => {
          const existing = prevById.get(session.session_id);
          if (!existing) {
            return session;
          }

          const shouldPreserveLocalTitle =
            (session.title === 'Untitled Story' || !session.title) &&
            existing.title &&
            existing.title !== 'Untitled Story';

          return shouldPreserveLocalTitle
            ? { ...session, title: existing.title, updated_at: existing.updated_at ?? session.updated_at }
            : session;
        });

        const incomingIds = new Set(merged.map((session: Session) => session.session_id));
        const localOnly = prev.filter(session => !incomingIds.has(session.session_id));
        return [...localOnly, ...merged];
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuthRetry]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetchWithAuthRetry(`${API_BASE}/api/v1/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete session');
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));
    } catch (err: any) {
      setError(err.message);
    }
  }, [fetchWithAuthRetry]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    try {
      const res = await fetchWithAuthRetry(`${API_BASE}/api/v1/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error('Failed to rename session');
      setSessions(prev =>
        prev.map(s => s.session_id === sessionId ? { ...s, title } : s)
      );
    } catch (err: any) {
      setError(err.message);
    }
  }, [fetchWithAuthRetry]);

  const getSessionDetail = useCallback(async (sessionId: string): Promise<SessionDetail> => {
    try {
      setError(null);
      const res = await fetchWithAuthRetry(`${API_BASE}/api/v1/sessions/${sessionId}`);
      if (!res.ok) throw new Error('Failed to fetch session detail');
      const data = await res.json();
      return data.data as SessionDetail;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [fetchWithAuthRetry]);

  const updateSessionInState = useCallback(
    (sessionId: string, patch: Partial<Session>) => {
      setSessions(prev => {
        const existing = prev.find(s => s.session_id === sessionId);
        if (existing) {
          return prev.map(s => (s.session_id === sessionId ? { ...s, ...patch } : s));
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
        return [placeholder, ...prev];
      });
    },
    []
  );

  // Fetch once auth is ready and user is logged in
  useEffect(() => {
    if (!authLoading && user) {
      fetchSessions();
    }
    if (!authLoading && !user) {
      setSessions([]);
      setLoading(false);
    }
  }, [authLoading, user, fetchSessions]);

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

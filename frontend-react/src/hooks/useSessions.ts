import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Session, SessionDetail } from '../types/session';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function useSessions() {
  const { getIdToken, user, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();
      const res = await fetch(`${API_BASE}/api/v1/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();
      setSessions(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`${API_BASE}/api/v1/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete session');
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));
    } catch (err: any) {
      setError(err.message);
    }
  }, [getIdToken]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`${API_BASE}/api/v1/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
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
  }, [getIdToken]);

  const getSessionDetail = useCallback(async (sessionId: string): Promise<SessionDetail> => {
    try {
      setError(null);
      const token = await getIdToken();
      const res = await fetch(`${API_BASE}/api/v1/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch session detail');
      const data = await res.json();
      return data.data as SessionDetail;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [getIdToken]);

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
  };
}

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config/api';
import type {
  UserProfile,
  UpsertUserRequest,
  OnboardingCompleteRequest,
} from '../types/user';

const ME_KEY = ['me'] as const;

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

export function useUserProfile() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const authFetch = useAuthFetch();

  // ── GET /api/v1/users/me ───────────────────────────────────────────────

  const {
    data: profile,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery<UserProfile>({
    queryKey: [...ME_KEY],
    queryFn: async () => {
      const res = await authFetch(`${API_BASE}/api/v1/users/me`);
      if (!res.ok) throw new Error('Failed to fetch user profile');
      return res.json() as Promise<UserProfile>;
    },
    enabled: !authLoading && !!user,
    staleTime: 5 * 60 * 1000,
  });

  // ── PUT /api/v1/users/me ───────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: async (body: UpsertUserRequest) => {
      const res = await authFetch(`${API_BASE}/api/v1/users/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update user profile');
      return res.json() as Promise<UserProfile>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<UserProfile>([...ME_KEY], updated);
    },
  });

  const updateProfile = useCallback(
    (body: UpsertUserRequest) => updateMutation.mutateAsync(body),
    [updateMutation],
  );

  // ── POST /api/v1/users/me/onboarding/complete ─────────────────────────

  const completeMutation = useMutation({
    mutationFn: async (body: OnboardingCompleteRequest) => {
      const res = await authFetch(`${API_BASE}/api/v1/users/me/onboarding/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to complete onboarding');
      return res.json() as Promise<UserProfile>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<UserProfile>([...ME_KEY], updated);
    },
  });

  const completeOnboarding = useCallback(
    (body: OnboardingCompleteRequest) => completeMutation.mutateAsync(body),
    [completeMutation],
  );

  // ── POST /api/v1/users/me/onboarding/skip ────────────────────────────

  const skipMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`${API_BASE}/api/v1/users/me/onboarding/skip`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to skip onboarding');
      return res.json() as Promise<UserProfile>;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<UserProfile>([...ME_KEY], updated);
    },
  });

  const skipOnboarding = useCallback(
    () => skipMutation.mutateAsync(),
    [skipMutation],
  );

  // ── Return ─────────────────────────────────────────────────────────────

  return {
    profile: profile ?? null,
    isLoading: authLoading || isLoading,
    isFetching,
    error: queryError ? (queryError as Error).message : null,
    refetch,
    updateProfile,
    completeOnboarding,
    skipOnboarding,
    isUpdating: updateMutation.isPending,
    isCompleting: completeMutation.isPending,
    isSkipping: skipMutation.isPending,
  };
}

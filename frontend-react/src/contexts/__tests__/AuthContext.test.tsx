/**
 * Unit tests for AuthContext — AuthProvider + useAuth hook.
 *
 * Firebase is fully mocked; these tests verify
 * the provider wiring, state transitions, and auth actions.
 */

// Mock Firebase modules (must be before imports)
vi.mock('../../config/firebase', () => ({
  auth: {
    onAuthStateChanged: vi.fn(),
    signOut: vi.fn(),
    currentUser: null,
  },
  default: {},
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
}));

import { render, screen, act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from '../AuthContext';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../../config/firebase';

// Cast mocked functions for easy access
const mockOnAuthStateChanged = vi.mocked(onAuthStateChanged);
const mockSignInWithPopup = vi.mocked(signInWithPopup);
const mockSignInWithEmail = vi.mocked(signInWithEmailAndPassword);
const mockCreateUser = vi.mocked(createUserWithEmailAndPassword);
const mockUpdateProfile = vi.mocked(updateProfile);

// Wrapper for renderHook
function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: onAuthStateChanged calls back with null (no user)
    mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
      callback(null);
      return vi.fn(); // unsubscribe
    });
  });

  // ── Provider Rendering ──────────────────────────────────────
  describe('AuthProvider', () => {
    it('should render children', () => {
      render(
        <AuthProvider>
          <div data-testid="child">Hello</div>
        </AuthProvider>,
      );
      expect(screen.getByTestId('child')).toHaveTextContent('Hello');
    });

    it('should start with loading=true before auth resolves', () => {
      // Don't call the callback immediately
      mockOnAuthStateChanged.mockImplementation(() => vi.fn());

      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.loading).toBe(true);
      expect(result.current.user).toBeNull();
    });

    it('should set loading=false and user=null when no user is signed in', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(result.current.user).toBeNull();
    });

    it('should set user after auth state change with a Firebase user', async () => {
      const fakeFirebaseUser = {
        uid: 'uid-123',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://photo.url/pic.jpg',
        getIdToken: vi.fn().mockResolvedValue('mock-token'),
      };

      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(fakeFirebaseUser);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toEqual({
        uid: 'uid-123',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://photo.url/pic.jpg',
      });
    });
  });

  // ── Auth Actions ────────────────────────────────────────────
  describe('signInWithGoogle', () => {
    it('should call signInWithPopup with auth and GoogleAuthProvider', async () => {
      mockSignInWithPopup.mockResolvedValue({} as any);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signInWithGoogle();
      });

      expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
      expect(mockSignInWithPopup).toHaveBeenCalledWith(auth, expect.anything());
    });
  });

  describe('signInWithEmail', () => {
    it('should call signInWithEmailAndPassword with auth, email, and password', async () => {
      mockSignInWithEmail.mockResolvedValue({} as any);

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signInWithEmail('user@test.com', 'password123');
      });

      expect(mockSignInWithEmail).toHaveBeenCalledWith(auth, 'user@test.com', 'password123');
    });
  });

  describe('signUpWithEmail', () => {
    it('should call createUserWithEmailAndPassword and updateProfile', async () => {
      const fakeUser = {
        uid: 'new-uid',
        email: 'new@test.com',
        displayName: null,
        photoURL: null,
        getIdToken: vi.fn(),
      };
      mockCreateUser.mockResolvedValue({ user: fakeUser } as any);
      mockUpdateProfile.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signUpWithEmail('new@test.com', 'pass123', 'New User');
      });

      expect(mockCreateUser).toHaveBeenCalledWith(auth, 'new@test.com', 'pass123');
      expect(mockUpdateProfile).toHaveBeenCalledWith(fakeUser, { displayName: 'New User' });
    });
  });

  describe('signOut', () => {
    it('should call firebaseSignOut with auth', async () => {
      // Import the mocked signOut from firebase/auth
      const firebaseAuth = await import('firebase/auth');
      const mockFirebaseSignOut = vi.mocked(firebaseAuth.signOut);
      mockFirebaseSignOut.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.signOut();
      });

      // The AuthContext imports signOut as firebaseSignOut from firebase/auth
      // but our setup.ts mocks it. We check the auth module's signOut was called.
      expect(mockFirebaseSignOut).toHaveBeenCalled();
    });
  });

  describe('getIdToken', () => {
    it('should return token from currentUser.getIdToken', async () => {
      const fakeFirebaseUser = {
        uid: 'uid-123',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: null,
        getIdToken: vi.fn().mockResolvedValue('my-id-token'),
      };

      // Set currentUser on the mocked auth
      (auth as any).currentUser = fakeFirebaseUser;

      mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
        callback(fakeFirebaseUser);
        return vi.fn();
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let token: string | undefined;
      await act(async () => {
        token = await result.current.getIdToken();
      });

      expect(fakeFirebaseUser.getIdToken).toHaveBeenCalledWith(true);
      expect(token).toBe('my-id-token');

      // Cleanup
      (auth as any).currentUser = null;
    });

    it('should throw if no authenticated user', async () => {
      (auth as any).currentUser = null;

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(
        act(async () => {
          await result.current.getIdToken();
        }),
      ).rejects.toThrow('No authenticated user');
    });
  });

  // ── Error Handling ──────────────────────────────────────────
  describe('error handling', () => {
    it('should propagate signInWithGoogle errors', async () => {
      mockSignInWithPopup.mockRejectedValue(new Error('popup-closed'));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(
        act(async () => {
          await result.current.signInWithGoogle();
        }),
      ).rejects.toThrow('popup-closed');
    });

    it('should propagate signInWithEmail errors', async () => {
      mockSignInWithEmail.mockRejectedValue(new Error('wrong-password'));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(
        act(async () => {
          await result.current.signInWithEmail('a@b.com', 'bad');
        }),
      ).rejects.toThrow('wrong-password');
    });
  });

  // ── useAuth outside provider ────────────────────────────────
  describe('useAuth outside provider', () => {
    it('should throw when used outside AuthProvider', () => {
      // Suppress console.error from React for this expected error
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');

      spy.mockRestore();
    });
  });
});

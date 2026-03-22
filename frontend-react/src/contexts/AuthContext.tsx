import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../config/firebase';
import type { AuthUser, AuthContextType } from '../types/auth';

/* ── helpers ─────────────────────────────────────── */

function mapFirebaseUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

const googleProvider = new GoogleAuthProvider();

/* ── context ─────────────────────────────────────── */

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/* ── provider ────────────────────────────────────── */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /* Listen to Firebase auth state */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ? mapFirebaseUser(firebaseUser) : null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  /* ── auth actions ──────────────────────────────── */

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName });
      // Re-map user so displayName is reflected immediately
      setUser(mapFirebaseUser(credential.user));
    },
    [],
  );

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const getIdToken = useCallback(async (): Promise<string> => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('No authenticated user');
    // Let Firebase SDK handle token refresh automatically (refreshes when
    // within 5 min of expiry). Passing `true` would force a network
    // round-trip on every call, adding 100-300ms unnecessary latency.
    return currentUser.getIdToken();
  }, []);

  /* ── render ────────────────────────────────────── */

  const value: AuthContextType = {
    user,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    getIdToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ── hook ─────────────────────────────────────────── */

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

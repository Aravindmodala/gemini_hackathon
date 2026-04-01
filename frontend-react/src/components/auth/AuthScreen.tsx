import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';

/* ══════════════════════════════════════════════════════
   AuthScreen — Sign In / Sign Up for The Emotional Chronicler
   Self-contained with inline styles (CSS-in-JS).
   ══════════════════════════════════════════════════════ */

type AuthTab = 'signin' | 'signup';

export function AuthScreen() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();

  const [tab, setTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /* ── helpers ──────────────────────────────────── */

  function resetForm() {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
    setError('');
  }

  function switchTab(next: AuthTab) {
    resetForm();
    setTab(next);
  }

  function friendlyError(err: unknown): string {
    const code = (err as { code?: string }).code ?? '';
    const map: Record<string, string> = {
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/invalid-credential': 'Invalid credentials. Please check your email and password.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password should be at least 6 characters.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/popup-closed-by-user': 'Sign-in popup was closed. Please try again.',
      'auth/network-request-failed': 'Network error. Check your connection.',
    };
    return map[code] ?? (err instanceof Error ? err.message : 'An unexpected error occurred.');
  }

  /* ── handlers ─────────────────────────────────── */

  async function handleEmailSignIn(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSignUp(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!displayName.trim()) {
      setError('Please enter your name.');
      return;
    }
    setBusy(true);
    try {
      await signUpWithEmail(email, password, displayName.trim());
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  /* ── styles ───────────────────────────────────── */

  const S = styles; // alias for readability

  /* ── render ───────────────────────────────────── */

  return (
    <div style={S.backdrop}>
      {/* Animated background orbs */}
      <div style={S.orb1} />
      <div style={S.orb2} />
      <div style={S.orb3} />

      <div style={S.card}>
        {/* Title */}
        <div style={S.titleWrap}>
          <span style={S.gem}>✦</span>
          <h1 style={S.title}>The Emotional Chronicler</h1>
          <p style={S.tagline}>Where your emotions shape the story</p>
        </div>

        {/* Tab toggle */}
        <div style={S.tabRow}>
          <button
            style={tab === 'signin' ? { ...S.tabBtn, ...S.tabBtnActive } : S.tabBtn}
            onClick={() => switchTab('signin')}
            type="button"
          >
            Sign In
          </button>
          <button
            style={tab === 'signup' ? { ...S.tabBtn, ...S.tabBtnActive } : S.tabBtn}
            onClick={() => switchTab('signup')}
            type="button"
          >
            Sign Up
          </button>
        </div>

        {/* Error banner */}
        {error && <div style={S.errorBanner}>{error}</div>}

        {/* ── Sign In form ─────────────────────── */}
        {tab === 'signin' && (
          <form onSubmit={handleEmailSignIn} style={S.form}>
            <input
              style={S.input}
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              style={S.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button style={busy ? { ...S.primaryBtn, ...S.btnDisabled } : S.primaryBtn} type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {/* ── Sign Up form ─────────────────────── */}
        {tab === 'signup' && (
          <form onSubmit={handleEmailSignUp} style={S.form}>
            <input
              style={S.input}
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoComplete="name"
            />
            <input
              style={S.input}
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              style={S.input}
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <input
              style={S.input}
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <button style={busy ? { ...S.primaryBtn, ...S.btnDisabled } : S.primaryBtn} type="submit" disabled={busy}>
              {busy ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}

        {/* Divider */}
        <div style={S.divider}>
          <span style={S.dividerLine} />
          <span style={S.dividerText}>or</span>
          <span style={S.dividerLine} />
        </div>

        {/* Google button */}
        <button style={busy ? { ...S.googleBtn, ...S.btnDisabled } : S.googleBtn} onClick={handleGoogle} disabled={busy} type="button">
          <svg style={S.googleIcon} viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>
      </div>

      {/* Inject keyframes via a <style> tag */}
      <style>{keyframeCSS}</style>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Inline Styles
   ══════════════════════════════════════════════════════ */

const styles: Record<string, CSSProperties> = {
  /* ── backdrop ─────────────────────────────────── */
  backdrop: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(ellipse at 60% 80%, #1a0a3a 0%, #05051a 50%, #000008 100%)',
    overflow: 'hidden',
    fontFamily: "'Inter', sans-serif",
    zIndex: 50,
  },

  /* ── floating orbs ────────────────────────────── */
  orb1: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 70%)',
    top: '-10%',
    left: '-5%',
    animation: 'authOrb1 12s ease-in-out infinite',
    pointerEvents: 'none' as const,
  },
  orb2: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(6,182,212,0.2) 0%, transparent 70%)',
    bottom: '-8%',
    right: '-3%',
    animation: 'authOrb2 15s ease-in-out infinite',
    pointerEvents: 'none' as const,
  },
  orb3: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(167,139,250,0.15) 0%, transparent 70%)',
    top: '40%',
    right: '20%',
    animation: 'authOrb3 10s ease-in-out infinite',
    pointerEvents: 'none' as const,
  },

  /* ── card ──────────────────────────────────────── */
  card: {
    position: 'relative',
    zIndex: 2,
    width: '100%',
    maxWidth: 420,
    padding: '40px 36px 36px',
    background: 'rgba(5, 5, 20, 0.75)',
    border: '1px solid rgba(124, 58, 237, 0.25)',
    borderRadius: 24,
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    boxShadow: '0 0 60px rgba(124,58,237,0.12), 0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
    animation: 'authCardIn 0.6s ease-out',
  },

  /* ── title ─────────────────────────────────────── */
  titleWrap: {
    textAlign: 'center' as const,
    marginBottom: 28,
  },
  gem: {
    display: 'inline-block',
    fontSize: 28,
    color: '#a78bfa',
    filter: 'drop-shadow(0 0 10px #7c3aed)',
    marginBottom: 8,
    animation: 'authGemPulse 3s ease-in-out infinite',
  },
  title: {
    fontFamily: "'Cinzel', serif",
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '0.1em',
    background: 'linear-gradient(135deg, #fff 0%, #a78bfa 60%, #06b6d4 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    lineHeight: 1.3,
    margin: 0,
  },
  tagline: {
    fontSize: 12,
    color: '#94a3b8',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    marginTop: 6,
  },

  /* ── tabs ──────────────────────────────────────── */
  tabRow: {
    display: 'flex',
    gap: 4,
    marginBottom: 20,
    background: 'rgba(30, 16, 64, 0.5)',
    borderRadius: 12,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    padding: '10px 0',
    border: 'none',
    borderRadius: 10,
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.25s ease',
  },
  tabBtnActive: {
    background: 'rgba(124, 58, 237, 0.3)',
    color: '#e2e8f0',
    boxShadow: '0 0 12px rgba(124,58,237,0.25)',
  },

  /* ── error ─────────────────────────────────────── */
  errorBanner: {
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    padding: '10px 14px',
    marginBottom: 16,
    fontSize: 13,
    color: '#fca5a5',
    lineHeight: 1.4,
  },

  /* ── form ──────────────────────────────────────── */
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid rgba(124, 58, 237, 0.2)',
    borderRadius: 12,
    background: 'rgba(30, 16, 64, 0.35)',
    color: '#e2e8f0',
    fontSize: 14,
    fontFamily: "'Inter', sans-serif",
    outline: 'none',
    transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
    boxSizing: 'border-box' as const,
  },

  /* ── primary button ────────────────────────────── */
  primaryBtn: {
    width: '100%',
    padding: '13px 0',
    border: 'none',
    borderRadius: 12,
    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    boxShadow: '0 4px 20px rgba(124,58,237,0.35)',
    marginTop: 4,
  },
  btnDisabled: {
    opacity: 0.55,
    cursor: 'not-allowed',
  },

  /* ── divider ───────────────────────────────────── */
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '20px 0',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'rgba(124, 58, 237, 0.2)',
  },
  dividerText: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
  },

  /* ── google button ─────────────────────────────── */
  googleBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '12px 0',
    border: '1px solid rgba(124, 58, 237, 0.2)',
    borderRadius: 12,
    background: 'rgba(30, 16, 64, 0.35)',
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
    transition: 'all 0.25s ease',
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
};

/* ══════════════════════════════════════════════════════
   Keyframe animations (injected via <style>)
   ══════════════════════════════════════════════════════ */

const keyframeCSS = `
@keyframes authOrb1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(40px, 30px) scale(1.1); }
}
@keyframes authOrb2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50%      { transform: translate(-30px, -20px) scale(1.15); }
}
@keyframes authOrb3 {
  0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
  50%      { transform: translate(20px, -25px) scale(1.08); opacity: 1; }
}
@keyframes authCardIn {
  from { opacity: 0; transform: translateY(24px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes authGemPulse {
  0%, 100% { opacity: 1; filter: drop-shadow(0 0 10px #7c3aed); }
  50%      { opacity: 0.7; filter: drop-shadow(0 0 18px #06b6d4); }
}

/* Focus styles for inputs (can't do pseudo-classes inline) */
.auth-screen-active input:focus {
  border-color: #7c3aed !important;
  box-shadow: 0 0 0 3px rgba(124,58,237,0.15) !important;
}
`;

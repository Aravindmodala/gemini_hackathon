/**
 * Unit tests for the AuthScreen component.
 *
 * Tests sign-in/sign-up forms, tab switching, validation,
 * Google sign-in, error display, and loading states.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthScreen } from '../AuthScreen';

// ── Mock useAuth ────────────────────────────────────────────
const mockSignInWithGoogle = vi.fn();
const mockSignInWithEmail = vi.fn();
const mockSignUpWithEmail = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signInWithGoogle: mockSignInWithGoogle,
    signInWithEmail: mockSignInWithEmail,
    signUpWithEmail: mockSignUpWithEmail,
    signOut: vi.fn(),
    getIdToken: vi.fn().mockResolvedValue('mock-token'),
  }),
}));

describe('AuthScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithGoogle.mockResolvedValue(undefined);
    mockSignInWithEmail.mockResolvedValue(undefined);
    mockSignUpWithEmail.mockResolvedValue(undefined);
  });

  // ── Default Render ──────────────────────────────────────────
  describe('default render', () => {
    it('should render the title "The Emotional Chronicler"', () => {
      render(<AuthScreen />);
      expect(screen.getByText('The Emotional Chronicler')).toBeInTheDocument();
    });

    it('should render the tagline', () => {
      render(<AuthScreen />);
      expect(screen.getByText('Where your emotions shape the story')).toBeInTheDocument();
    });

    it('should render sign-in form by default', () => {
      render(<AuthScreen />);
      expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
      // Both tab and submit button say "Sign In" — use getAllByRole
      const signInButtons = screen.getAllByRole('button', { name: /sign in/i });
      expect(signInButtons.length).toBeGreaterThanOrEqual(2); // tab + submit
    });

    it('should render the Google sign-in button', () => {
      render(<AuthScreen />);
      expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    });

    it('should render Sign In and Sign Up tab buttons', () => {
      render(<AuthScreen />);
      // Both tab and submit button say "Sign In" — use getAllByRole
      const signInButtons = screen.getAllByRole('button', { name: /sign in/i });
      expect(signInButtons.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
    });
  });

  // ── Tab Switching ───────────────────────────────────────────
  describe('tab switching', () => {
    it('should switch to sign-up form when Sign Up tab is clicked', async () => {
      const user = userEvent.setup();
      render(<AuthScreen />);

      await user.click(screen.getByRole('button', { name: 'Sign Up' }));

      expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/password.*min/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Confirm password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it('should switch back to sign-in form when Sign In tab is clicked', async () => {
      const user = userEvent.setup();
      render(<AuthScreen />);

      // Go to sign up
      await user.click(screen.getByRole('button', { name: 'Sign Up' }));
      expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();

      // Go back to sign in
      await user.click(screen.getByRole('button', { name: 'Sign In' }));
      expect(screen.queryByPlaceholderText('Your name')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
    });

    it('should clear form fields when switching tabs', async () => {
      const user = userEvent.setup();
      render(<AuthScreen />);

      // Type in sign-in form
      await user.type(screen.getByPlaceholderText('Email address'), 'test@test.com');

      // Switch to sign up
      await user.click(screen.getByRole('button', { name: 'Sign Up' }));

      // Email should be cleared
      expect(screen.getByPlaceholderText('Email address')).toHaveValue('');
    });
  });

  // ── Sign In Form Submission ─────────────────────────────────
  describe('sign-in form submission', () => {
    it('should call signInWithEmail on form submit', async () => {
      const user = userEvent.setup();
      render(<AuthScreen />);

      await user.type(screen.getByPlaceholderText('Email address'), 'user@test.com');
      await user.type(screen.getByPlaceholderText('Password'), 'mypassword');
      await user.click(screen.getAllByRole('button', { name: /sign in/i }).find(b => b.getAttribute('type') === 'submit')!);

      await waitFor(() => {
        expect(mockSignInWithEmail).toHaveBeenCalledWith('user@test.com', 'mypassword');
      });
    });

    it('should show error message on sign-in failure', async () => {
      mockSignInWithEmail.mockRejectedValue({ code: 'auth/wrong-password' });

      const user = userEvent.setup();
      render(<AuthScreen />);

      await user.type(screen.getByPlaceholderText('Email address'), 'user@test.com');
      await user.type(screen.getByPlaceholderText('Password'), 'wrong');
      await user.click(screen.getAllByRole('button', { name: /sign in/i }).find(b => b.getAttribute('type') === 'submit')!);

      await waitFor(() => {
        expect(screen.getByText('Incorrect password. Please try again.')).toBeInTheDocument();
      });
    });

    it('should show "Signing in…" while busy', async () => {
      // Make signInWithEmail hang
      mockSignInWithEmail.mockImplementation(() => new Promise(() => {}));

      const user = userEvent.setup();
      render(<AuthScreen />);

      await user.type(screen.getByPlaceholderText('Email address'), 'user@test.com');
      await user.type(screen.getByPlaceholderText('Password'), 'pass');
      await user.click(screen.getAllByRole('button', { name: /sign in/i }).find(b => b.getAttribute('type') === 'submit')!);

      await waitFor(() => {
        expect(screen.getByText('Signing in…')).toBeInTheDocument();
      });
    });
  });

  // ── Sign Up Form Submission ─────────────────────────────────
  describe('sign-up form submission', () => {
    it('should call signUpWithEmail on form submit', async () => {
      const user = userEvent.setup();
      render(<AuthScreen />);

      await user.click(screen.getByRole('button', { name: 'Sign Up' }));

      await user.type(screen.getByPlaceholderText('Your name'), 'Test User');
      await user.type(screen.getByPlaceholderText('Email address'), 'new@test.com');
      await user.type(screen.getByPlaceholderText(/password.*min/i), 'pass123');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'pass123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(mockSignUpWithEmail).toHaveBeenCalledWith('new@test.com', 'pass123', 'Test User');
      });
    });

    it('should show password mismatch error', async () => {
      const user = userEvent.setup();
      render(<AuthScreen />);

      await user.click(screen.getByRole('button', { name: 'Sign Up' }));

      await user.type(screen.getByPlaceholderText('Your name'), 'Test User');
      await user.type(screen.getByPlaceholderText('Email address'), 'new@test.com');
      await user.type(screen.getByPlaceholderText(/password.*min/i), 'pass123');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'different');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
      });

      // signUpWithEmail should NOT have been called
      expect(mockSignUpWithEmail).not.toHaveBeenCalled();
    });

    it('should show error when display name is empty', async () => {
      const user = userEvent.setup();
      render(<AuthScreen />);

      await user.click(screen.getByRole('button', { name: 'Sign Up' }));

      // Fill name with spaces only
      await user.type(screen.getByPlaceholderText('Your name'), '   ');
      await user.type(screen.getByPlaceholderText('Email address'), 'new@test.com');
      await user.type(screen.getByPlaceholderText(/password.*min/i), 'pass123');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'pass123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Please enter your name.')).toBeInTheDocument();
      });

      expect(mockSignUpWithEmail).not.toHaveBeenCalled();
    });

    it('should show error on sign-up failure', async () => {
      mockSignUpWithEmail.mockRejectedValue({ code: 'auth/email-already-in-use' });

      const user = userEvent.setup();
      render(<AuthScreen />);

      await user.click(screen.getByRole('button', { name: 'Sign Up' }));

      await user.type(screen.getByPlaceholderText('Your name'), 'Test');
      await user.type(screen.getByPlaceholderText('Email address'), 'existing@test.com');
      await user.type(screen.getByPlaceholderText(/password.*min/i), 'pass123');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'pass123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('An account with this email already exists.')).toBeInTheDocument();
      });
    });

    it('should show "Creating account…" while busy', async () => {
      mockSignUpWithEmail.mockImplementation(() => new Promise(() => {}));

      const user = userEvent.setup();
      render(<AuthScreen />);

      await user.click(screen.getByRole('button', { name: 'Sign Up' }));

      await user.type(screen.getByPlaceholderText('Your name'), 'Test');
      await user.type(screen.getByPlaceholderText('Email address'), 'new@test.com');
      await user.type(screen.getByPlaceholderText(/password.*min/i), 'pass123');
      await user.type(screen.getByPlaceholderText('Confirm password'), 'pass123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Creating account…')).toBeInTheDocument();
      });
    });
  });

  // ── Google Sign-In ──────────────────────────────────────────
  describe('Google sign-in', () => {
    it('should call signInWithGoogle when Google button is clicked', async () => {
      const user = userEvent.setup();
      render(<AuthScreen />);

      await user.click(screen.getByRole('button', { name: /continue with google/i }));

      await waitFor(() => {
        expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
      });
    });

    it('should show error on Google sign-in failure', async () => {
      mockSignInWithGoogle.mockRejectedValue({ code: 'auth/popup-closed-by-user' });

      const user = userEvent.setup();
      render(<AuthScreen />);

      await user.click(screen.getByRole('button', { name: /continue with google/i }));

      await waitFor(() => {
        expect(screen.getByText('Sign-in popup was closed. Please try again.')).toBeInTheDocument();
      });
    });
  });

  // ── Error Display ───────────────────────────────────────────
  describe('error display', () => {
    it('should show generic error for unknown error codes', async () => {
      mockSignInWithEmail.mockRejectedValue(new Error('Something unexpected'));

      const user = userEvent.setup();
      render(<AuthScreen />);

      await user.type(screen.getByPlaceholderText('Email address'), 'user@test.com');
      await user.type(screen.getByPlaceholderText('Password'), 'pass');
      await user.click(screen.getAllByRole('button', { name: /sign in/i }).find(b => b.getAttribute('type') === 'submit')!);

      await waitFor(() => {
        expect(screen.getByText('Something unexpected')).toBeInTheDocument();
      });
    });

    it('should show network error message', async () => {
      mockSignInWithEmail.mockRejectedValue({ code: 'auth/network-request-failed' });

      const user = userEvent.setup();
      render(<AuthScreen />);

      await user.type(screen.getByPlaceholderText('Email address'), 'user@test.com');
      await user.type(screen.getByPlaceholderText('Password'), 'pass');
      await user.click(screen.getAllByRole('button', { name: /sign in/i }).find(b => b.getAttribute('type') === 'submit')!);

      await waitFor(() => {
        expect(screen.getByText('Network error. Check your connection.')).toBeInTheDocument();
      });
    });
  });
});

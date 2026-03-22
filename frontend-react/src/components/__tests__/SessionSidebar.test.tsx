/**
 * Unit tests for the SessionSidebar component.
 *
 * Tests session list rendering, grouping, selection, rename,
 * delete, new story, sign out, and user info display.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionSidebar } from '../SessionSidebar';
import type { Session } from '../../types/session';

// ── Helpers ─────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    session_id: 'sess-1',
    title: 'My Story',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    interaction_count: 5,
    preview: 'Once upon a time...',
    ...overrides,
  };
}

const defaultProps = {
  sessions: [] as Session[],
  loading: false,
  activeSessionId: null as string | null,
  onNewStory: vi.fn(),
  onSelectSession: vi.fn(),
  onDeleteSession: vi.fn(),
  onRenameSession: vi.fn(),
  onSignOut: vi.fn(),
  userName: 'Test User',
  userEmail: 'test@test.com',
  userPhoto: null as string | null,
  isOpen: true,
  onToggle: vi.fn(),
};

describe('SessionSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Basic Rendering ─────────────────────────────────────────
  describe('basic rendering', () => {
    it('should render "New Story" button', () => {
      render(<SessionSidebar {...defaultProps} />);
      expect(screen.getByText('New Story')).toBeInTheDocument();
    });

    it('should render "Sessions" title', () => {
      render(<SessionSidebar {...defaultProps} />);
      expect(screen.getByText('Sessions')).toBeInTheDocument();
    });

    it('should render sign out button', () => {
      render(<SessionSidebar {...defaultProps} />);
      expect(screen.getByText('Sign Out')).toBeInTheDocument();
    });

    it('should render user name', () => {
      render(<SessionSidebar {...defaultProps} />);
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    it('should render user email', () => {
      render(<SessionSidebar {...defaultProps} />);
      expect(screen.getByText('test@test.com')).toBeInTheDocument();
    });

    it('should render user avatar fallback initial when no photo', () => {
      render(<SessionSidebar {...defaultProps} userPhoto={null} />);
      expect(screen.getByText('T')).toBeInTheDocument(); // First letter of "Test User"
    });

    it('should render user photo when provided', () => {
      const { container } = render(<SessionSidebar {...defaultProps} userPhoto="https://photo.url/pic.jpg" />);
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img!.getAttribute('src')).toBe('https://photo.url/pic.jpg');
    });
  });

  // ── Empty State ─────────────────────────────────────────────
  describe('empty state', () => {
    it('should show empty message when no sessions', () => {
      render(<SessionSidebar {...defaultProps} sessions={[]} />);
      expect(screen.getByText(/no stories yet/i)).toBeInTheDocument();
    });

    it('should show loading message when loading with no sessions', () => {
      render(<SessionSidebar {...defaultProps} sessions={[]} loading={true} />);
      expect(screen.getByText(/loading sessions/i)).toBeInTheDocument();
    });
  });

  // ── Session List ────────────────────────────────────────────
  describe('session list', () => {
    it('should render session titles', () => {
      const sessions = [
        makeSession({ session_id: 's1', title: 'Dragon Quest' }),
        makeSession({ session_id: 's2', title: 'Space Adventure' }),
      ];
      render(<SessionSidebar {...defaultProps} sessions={sessions} />);

      expect(screen.getByText('Dragon Quest')).toBeInTheDocument();
      expect(screen.getByText('Space Adventure')).toBeInTheDocument();
    });

    it('should show "Untitled Story" for sessions without title', () => {
      const sessions = [makeSession({ session_id: 's1', title: '' })];
      render(<SessionSidebar {...defaultProps} sessions={sessions} />);
      expect(screen.getByText('Untitled Story')).toBeInTheDocument();
    });

    it('should render session preview text', () => {
      const sessions = [makeSession({ session_id: 's1', preview: 'A dark forest...' })];
      render(<SessionSidebar {...defaultProps} sessions={sessions} />);
      expect(screen.getByText('A dark forest...')).toBeInTheDocument();
    });
  });

  // ── Session Selection ───────────────────────────────────────
  describe('session selection', () => {
    it('should call onSelectSession when a session is clicked', async () => {
      const user = userEvent.setup();
      const sessions = [makeSession({ session_id: 'sess-42', title: 'My Story' })];
      render(<SessionSidebar {...defaultProps} sessions={sessions} />);

      await user.click(screen.getByText('My Story'));

      expect(defaultProps.onSelectSession).toHaveBeenCalledWith('sess-42');
    });
  });

  // ── New Story ───────────────────────────────────────────────
  describe('new story', () => {
    it('should call onNewStory when "New Story" button is clicked', async () => {
      const user = userEvent.setup();
      render(<SessionSidebar {...defaultProps} />);

      await user.click(screen.getByText('New Story'));

      expect(defaultProps.onNewStory).toHaveBeenCalledTimes(1);
    });
  });

  // ── Sign Out ────────────────────────────────────────────────
  describe('sign out', () => {
    it('should call onSignOut when sign out button is clicked', async () => {
      const user = userEvent.setup();
      render(<SessionSidebar {...defaultProps} />);

      await user.click(screen.getByText('Sign Out'));

      expect(defaultProps.onSignOut).toHaveBeenCalledTimes(1);
    });
  });

  // ── Delete Flow ─────────────────────────────────────────────
  describe('delete flow', () => {
    it('should show delete confirmation when delete button is clicked', async () => {
      const user = userEvent.setup();
      const sessions = [makeSession({ session_id: 'sess-1', title: 'My Story' })];
      render(<SessionSidebar {...defaultProps} sessions={sessions} />);

      // Use fireEvent.mouseEnter to trigger onMouseEnter (userEvent.hover doesn't work in jsdom)
      const sessionItem = screen.getByText('My Story').closest('div[style]')!;
      fireEvent.mouseEnter(sessionItem);

      // Click the delete button (🗑️)
      const deleteBtn = screen.getByTitle('Delete');
      await user.click(deleteBtn);

      // Should show confirmation
      expect(screen.getByText('Delete this story?')).toBeInTheDocument();
    });

    it('should call onDeleteSession when delete is confirmed', async () => {
      const user = userEvent.setup();
      const sessions = [makeSession({ session_id: 'sess-1', title: 'My Story' })];
      render(<SessionSidebar {...defaultProps} sessions={sessions} />);

      // Hover to show action buttons
      const sessionItem = screen.getByText('My Story').closest('div[style]')!;
      fireEvent.mouseEnter(sessionItem);

      // Click delete
      await user.click(screen.getByTitle('Delete'));

      // Confirm delete
      await user.click(screen.getByText('Delete'));

      expect(defaultProps.onDeleteSession).toHaveBeenCalledWith('sess-1');
    });

    it('should cancel delete when Cancel is clicked', async () => {
      const user = userEvent.setup();
      const sessions = [makeSession({ session_id: 'sess-1', title: 'My Story' })];
      render(<SessionSidebar {...defaultProps} sessions={sessions} />);

      // Hover to show action buttons
      const sessionItem = screen.getByText('My Story').closest('div[style]')!;
      fireEvent.mouseEnter(sessionItem);

      // Click delete
      await user.click(screen.getByTitle('Delete'));

      // Cancel
      await user.click(screen.getByText('Cancel'));

      expect(defaultProps.onDeleteSession).not.toHaveBeenCalled();
      // Session title should be visible again
      expect(screen.getByText('My Story')).toBeInTheDocument();
    });
  });

  // ── Rename Flow ─────────────────────────────────────────────
  describe('rename flow', () => {
    it('should show rename input when rename button is clicked', async () => {
      const user = userEvent.setup();
      const sessions = [makeSession({ session_id: 'sess-1', title: 'My Story' })];
      render(<SessionSidebar {...defaultProps} sessions={sessions} />);

      // Use fireEvent.mouseEnter to trigger hover state
      const sessionItem = screen.getByText('My Story').closest('div[style]')!;
      fireEvent.mouseEnter(sessionItem);

      // Click rename (✏️)
      await user.click(screen.getByTitle('Rename'));

      // Should show an input with the current title
      const input = screen.getByDisplayValue('My Story');
      expect(input).toBeInTheDocument();
    });

    it('should call onRenameSession when Enter is pressed', async () => {
      const user = userEvent.setup();
      const sessions = [makeSession({ session_id: 'sess-1', title: 'My Story' })];
      render(<SessionSidebar {...defaultProps} sessions={sessions} />);

      // Hover and click rename
      const sessionItem = screen.getByText('My Story').closest('div[style]')!;
      fireEvent.mouseEnter(sessionItem);
      await user.click(screen.getByTitle('Rename'));

      // Clear and type new name
      const input = screen.getByDisplayValue('My Story');
      await user.clear(input);
      await user.type(input, 'New Title{Enter}');

      expect(defaultProps.onRenameSession).toHaveBeenCalledWith('sess-1', 'New Title');
    });

    it('should cancel rename when Escape is pressed', async () => {
      const user = userEvent.setup();
      const sessions = [makeSession({ session_id: 'sess-1', title: 'My Story' })];
      render(<SessionSidebar {...defaultProps} sessions={sessions} />);

      // Hover and click rename
      const sessionItem = screen.getByText('My Story').closest('div[style]')!;
      fireEvent.mouseEnter(sessionItem);
      await user.click(screen.getByTitle('Rename'));

      // Press Escape
      const input = screen.getByDisplayValue('My Story');
      await user.type(input, '{Escape}');

      // onRenameSession should NOT have been called
      expect(defaultProps.onRenameSession).not.toHaveBeenCalled();
    });
  });

  // ── Session Grouping ────────────────────────────────────────
  describe('session grouping', () => {
    it('should group sessions by date (Today)', () => {
      const sessions = [
        makeSession({
          session_id: 's1',
          title: 'Today Story',
          updated_at: new Date().toISOString(),
        }),
      ];
      render(<SessionSidebar {...defaultProps} sessions={sessions} />);

      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByText('Today Story')).toBeInTheDocument();
    });

    it('should group sessions by date (Yesterday)', () => {
      const yesterday = new Date(Date.now() - 86400000);
      // Set to middle of yesterday to avoid edge cases
      yesterday.setHours(12, 0, 0, 0);
      const sessions = [
        makeSession({
          session_id: 's1',
          title: 'Yesterday Story',
          updated_at: yesterday.toISOString(),
        }),
      ];
      render(<SessionSidebar {...defaultProps} sessions={sessions} />);

      expect(screen.getByText('Yesterday')).toBeInTheDocument();
      expect(screen.getByText('Yesterday Story')).toBeInTheDocument();
    });

    it('should group older sessions', () => {
      const oldDate = new Date(Date.now() - 30 * 86400000); // 30 days ago
      const sessions = [
        makeSession({
          session_id: 's1',
          title: 'Old Story',
          updated_at: oldDate.toISOString(),
        }),
      ];
      render(<SessionSidebar {...defaultProps} sessions={sessions} />);

      expect(screen.getByText('Older')).toBeInTheDocument();
      expect(screen.getByText('Old Story')).toBeInTheDocument();
    });
  });

  // ── Toggle ──────────────────────────────────────────────────
  describe('toggle', () => {
    it('should call onToggle when toggle button is clicked', async () => {
      const user = userEvent.setup();
      render(<SessionSidebar {...defaultProps} isOpen={true} />);

      // The close button (✕) is inside the sidebar when open
      const closeBtn = screen.getByLabelText('Close sidebar');
      await user.click(closeBtn);

      expect(defaultProps.onToggle).toHaveBeenCalledTimes(1);
    });

    it('should show hamburger button when sidebar is closed', () => {
      render(<SessionSidebar {...defaultProps} isOpen={false} />);
      // There are two "Open sidebar" buttons (one in toggleWrap, one in sidebar topBar)
      const openBtns = screen.getAllByLabelText('Open sidebar');
      expect(openBtns.length).toBeGreaterThanOrEqual(1);
    });
  });
});

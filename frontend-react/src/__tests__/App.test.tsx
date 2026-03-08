/**
 * Unit tests for the App root component.
 *
 * Validates that all critical UI elements render correctly
 * in the default (disconnected) state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';

// Mock useStoryteller so we don't trigger real WebSocket/audio logic
vi.mock('../hooks/useStoryteller', () => ({
  useStoryteller: () => ({
    status: 'disconnected',
    logs: [],
    startStory: vi.fn(),
    stopStory: vi.fn(),
    sendImage: vi.fn(),
  }),
}));

describe('App', () => {
  beforeEach(() => {
    render(<App />);
  });

  // ── Title Badge ───────────────────────────────────────────
  describe('title badge', () => {
    it('should render the app title', () => {
      expect(screen.getByText('The Emotional Chronicler')).toBeInTheDocument();
    });

    it('should render the subtitle', () => {
      expect(screen.getByText('Immersive AI Storytelling')).toBeInTheDocument();
    });

    it('should render the gem icon', () => {
      expect(screen.getByText('✦')).toBeInTheDocument();
    });
  });

  // ── Connection Status ─────────────────────────────────────
  describe('connection status', () => {
    it('should show "DISCONNECTED" status label', () => {
      expect(screen.getByText('DISCONNECTED')).toBeInTheDocument();
    });
  });

  // ── Emotion Controls ──────────────────────────────────────
  describe('emotion controls', () => {
    it('should render all 4 emotion buttons', () => {
      expect(screen.getByText('😐')).toBeInTheDocument();
      expect(screen.getByText('😊')).toBeInTheDocument();
      expect(screen.getByText('😢')).toBeInTheDocument();
      expect(screen.getByText('😲')).toBeInTheDocument();
    });

    it('should have "neutral" button active by default', () => {
      const neutralBtn = screen.getByText('😐').closest('button');
      expect(neutralBtn?.className).toContain('emo-btn--active');
    });

    it('should switch active class when another emotion is clicked', () => {
      const happyBtn = screen.getByText('😊').closest('button')!;
      fireEvent.click(happyBtn);
      expect(happyBtn.className).toContain('emo-btn--active');
    });
  });

  // ── Talk Button (via AvatarHUD) ───────────────────────────
  describe('talk button', () => {
    it('should render the "Talk to Elora" button', () => {
      expect(screen.getByRole('button', { name: /talk to elora/i })).toBeInTheDocument();
    });
  });
});

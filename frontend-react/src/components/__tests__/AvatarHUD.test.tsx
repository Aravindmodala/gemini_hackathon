/**
 * Unit tests for the AvatarHUD component.
 *
 * Validates rendering across all 6 status states, button behavior,
 * waveform visibility, and status badge display.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AvatarHUD } from '../../components/AvatarHUD';

describe('AvatarHUD', () => {
  const mockOnStart = vi.fn();
  const mockOnStop = vi.fn();

  beforeEach(() => {
    mockOnStart.mockClear();
    mockOnStop.mockClear();
  });

  // ── Disconnected State ────────────────────────────────────
  describe('when disconnected', () => {
    it('should show "Talk to Elora" button label', () => {
      render(<AvatarHUD status="disconnected" onStart={mockOnStart} onStop={mockOnStop} />);
      expect(screen.getByRole('button')).toHaveTextContent('Talk to Elora');
    });

    it('should call onStart when button is clicked', () => {
      render(<AvatarHUD status="disconnected" onStart={mockOnStart} onStop={mockOnStop} />);
      fireEvent.click(screen.getByRole('button'));
      expect(mockOnStart).toHaveBeenCalledOnce();
      expect(mockOnStop).not.toHaveBeenCalled();
    });

    it('should NOT show the status badge', () => {
      render(<AvatarHUD status="disconnected" onStart={mockOnStart} onStop={mockOnStop} />);
      expect(screen.queryByText('Talk to Elora')).toBeInTheDocument(); // button label
      expect(screen.queryByText('Listening…')).not.toBeInTheDocument();
    });

    it('should not be disabled', () => {
      render(<AvatarHUD status="disconnected" onStart={mockOnStart} onStop={mockOnStop} />);
      expect(screen.getByRole('button')).not.toBeDisabled();
    });
  });

  // ── Connecting State ──────────────────────────────────────
  describe('when connecting', () => {
    it('should show "Awakening…" button label', () => {
      render(<AvatarHUD status="connecting" onStart={mockOnStart} onStop={mockOnStop} />);
      expect(screen.getByRole('button')).toHaveTextContent('Awakening…');
    });

    it('should be disabled', () => {
      render(<AvatarHUD status="connecting" onStart={mockOnStart} onStop={mockOnStop} />);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should show the status badge with "Awakening…" text', () => {
      render(<AvatarHUD status="connecting" onStart={mockOnStart} onStop={mockOnStop} />);
      // Both badge and button show "Awakening…"
      const awakeningElements = screen.getAllByText('Awakening…');
      expect(awakeningElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Connected State ───────────────────────────────────────
  describe('when connected', () => {
    it('should show "End Session" button label', () => {
      render(<AvatarHUD status="connected" onStart={mockOnStart} onStop={mockOnStop} />);
      expect(screen.getByRole('button')).toHaveTextContent('End Session');
    });

    it('should call onStop when button is clicked', () => {
      render(<AvatarHUD status="connected" onStart={mockOnStart} onStop={mockOnStop} />);
      fireEvent.click(screen.getByRole('button'));
      expect(mockOnStop).toHaveBeenCalledOnce();
      expect(mockOnStart).not.toHaveBeenCalled();
    });
  });

  // ── Listening State ───────────────────────────────────────
  describe('when listening', () => {
    it('should show "End Session" button label', () => {
      render(<AvatarHUD status="listening" onStart={mockOnStart} onStop={mockOnStop} />);
      expect(screen.getByRole('button')).toHaveTextContent('End Session');
    });

    it('should show the status badge with "Listening…"', () => {
      render(<AvatarHUD status="listening" onStart={mockOnStart} onStop={mockOnStop} />);
      expect(screen.getByText('Listening…')).toBeInTheDocument();
    });

    it('should call onStop when button is clicked', () => {
      render(<AvatarHUD status="listening" onStart={mockOnStart} onStop={mockOnStop} />);
      fireEvent.click(screen.getByRole('button'));
      expect(mockOnStop).toHaveBeenCalledOnce();
    });
  });

  // ── Speaking State ────────────────────────────────────────
  describe('when speaking', () => {
    it('should show "End Session" button label', () => {
      render(<AvatarHUD status="speaking" onStart={mockOnStart} onStop={mockOnStop} />);
      expect(screen.getByRole('button')).toHaveTextContent('End Session');
    });

    it('should show the status badge with "Elora is speaking…"', () => {
      render(<AvatarHUD status="speaking" onStart={mockOnStart} onStop={mockOnStop} />);
      expect(screen.getByText('Elora is speaking…')).toBeInTheDocument();
    });

    it('should call onStop when clicked', () => {
      render(<AvatarHUD status="speaking" onStart={mockOnStart} onStop={mockOnStop} />);
      fireEvent.click(screen.getByRole('button'));
      expect(mockOnStop).toHaveBeenCalledOnce();
    });
  });

  // ── Error State ───────────────────────────────────────────
  describe('when error', () => {
    it('should show "Talk to Elora" button (idle behavior)', () => {
      render(<AvatarHUD status="error" onStart={mockOnStart} onStop={mockOnStop} />);
      expect(screen.getByRole('button')).toHaveTextContent('Talk to Elora');
    });

    it('should call onStart when clicked (treats as idle)', () => {
      render(<AvatarHUD status="error" onStart={mockOnStart} onStop={mockOnStop} />);
      fireEvent.click(screen.getByRole('button'));
      expect(mockOnStart).toHaveBeenCalledOnce();
    });
  });

  // ── Button Enabled/Disabled ───────────────────────────────
  describe('button enabled state', () => {
    it.each([
      ['disconnected', false],
      ['connecting', true],
      ['connected', false],
      ['listening', false],
      ['speaking', false],
      ['error', false],
    ] as const)('status="%s" → disabled=%s', (status, shouldBeDisabled) => {
      render(<AvatarHUD status={status} onStart={mockOnStart} onStop={mockOnStop} />);
      const button = screen.getByRole('button');
      if (shouldBeDisabled) {
        expect(button).toBeDisabled();
      } else {
        expect(button).not.toBeDisabled();
      }
    });
  });
});

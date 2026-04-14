import { render, screen } from '@testing-library/react';
import { describe, it, beforeEach, expect, vi } from 'vitest';

import { StoryView } from './StoryView';
import * as formatter from '../../utils/formatStory';

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

describe('StoryView story blocks', () => {
  const spy = vi.spyOn(formatter, 'formatStoryText');

  beforeEach(() => {
    spy.mockReset();
  });

  it('renders heading, paragraph, divider, and dialogue blocks in order', () => {
    spy.mockReturnValue([
      {
        type: 'heading',
        chunks: [{ text: 'Prologue' }],
      },
      {
        type: 'paragraph',
        chunks: [
          { text: 'First paragraph ' },
          { text: 'strong', emphasis: 'bold' },
        ],
      },
      { type: 'sceneDivider', label: 'Scene Change' },
      {
        type: 'dialogue',
        speaker: 'NARRATOR',
        chunks: [{ text: 'Hello from afar.' }],
      },
    ]);

    render(
      <StoryView
        sections={[{ type: 'text', content: 'chunk' }]}
        status="done"
        currentMusic={null}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Prologue' })).toBeInTheDocument();
    expect(screen.getByText('First paragraph')).toBeInTheDocument();
    expect(screen.getByText('strong')).toHaveClass('emphasisBold');
    expect(screen.getByText('Scene Change')).toBeInTheDocument();
    expect(screen.getByText('NARRATOR')).toBeInTheDocument();
    expect(screen.getByText('Hello from afar.')).toBeInTheDocument();

    const blocks = screen.getAllByTestId(/story-block-/);
    expect(blocks[0]).toHaveAttribute('data-testid', expect.stringContaining('heading'));
    expect(blocks[1]).toHaveAttribute('data-testid', expect.stringContaining('paragraph'));
  });

  it('does not render blocks when formatter returns empty array', () => {
    spy.mockReturnValue([]);

    const { container } = render(
      <StoryView
        sections={[{ type: 'text', content: 'empty' }]}
        status="done"
        currentMusic={null}
      />,
    );

    expect(container.querySelectorAll('[data-testid^="story-block-paragraph"]').length).toBe(0);
  });

  it('keeps inline image placement in narrative flow', () => {
    spy.mockReturnValue([
      {
        type: 'paragraph',
        chunks: [{ text: 'Opening beat.' }],
      },
    ]);

    render(
      <StoryView
        sections={[
          { type: 'text', content: 'chunk' },
          { type: 'image', url: '/api/images/inline.png', caption: 'Inline visual' },
        ]}
        status="done"
        currentMusic={null}
      />,
    );

    const paragraph = screen.getByText('Opening beat.');
    const image = screen.getByAltText('Inline visual');
    expect(paragraph.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

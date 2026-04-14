export type Emphasis = 'italic' | 'bold';

export type TextSegment = {
  text: string;
  emphasis?: Emphasis;
};

export type StoryTextBlock =
  | { type: 'paragraph'; segments: TextSegment[] }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'divider'; label?: string }
  | { type: 'dialogue'; speaker?: string; segments: TextSegment[] };

/**
 * Placeholder formatter adapter.
 * Worker A will replace this with real heuristics.
 * For now it simply normalizes whitespace and produces paragraphs.
 */
export function buildTextBlocks(text: string): StoryTextBlock[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  return trimmed
    .split(/\n{2,}/)
    .map(block => block.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map(block => ({
      type: 'paragraph' as const,
      segments: [{ text: block }],
    }));
}

import type { StorySection } from '../hooks/useStoryteller';

const SCENE_BREAK_RE = /\n{2,}/g;

/**
 * Minimal formatting pipeline for story text chunks. Later workers can
 * expand this, but for now we normalize whitespace and preserve paragraphs.
 */
export function formatStoryChunk(chunk: string): StorySection[] {
  const normalized = chunk.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const paragraphs = normalized.split(SCENE_BREAK_RE);
  return paragraphs.map((paragraph) => ({
    type: 'text' as const,
    content: paragraph.trim(),
  })).filter((section) => section.content.length > 0);
}

export function formatStorySections(sections: StorySection[]): StorySection[] {
  return sections.flatMap((section) => {
    if (section.type !== 'text') return section;
    return formatStoryChunk(section.content);
  });
}

import { describe, expect, it } from 'vitest';
import { formatStoryText, InlineChunk, SceneDividerBlock } from '../utils/formatStory';

describe('formatStoryText', () => {
  it('splits paragraphs, headings, and scene dividers', () => {
    const blocks = formatStoryText('CHAPTER ONE\n\nThe lab exploded.\n\n***\n\nA second scene.');
    expect(blocks[0].type).toBe('heading');
    expect(blocks[1].type).toBe('paragraph');
    expect(blocks[2].type).toBe('sceneDivider');
    expect((blocks[2] as SceneDividerBlock).label).toContain('***');
  });

  it('parses bold and italic emphasis safely', () => {
    const [block] = formatStoryText('He whispered *softly*, then shouted **loudly**.');
    expect(block.type).toBe('paragraph');
    const chunks = (block as { chunks: InlineChunk[] }).chunks;
    expect(chunks.map(chunk => chunk.text)).toEqual(['He whispered ', 'softly', ', then shouted ', 'loudly', '.']);
    expect(chunks[1].emphasis).toBe('italic');
    expect(chunks[3].emphasis).toBe('bold');
  });

  it('classifies dialogue and carries speaker metadata', () => {
    const [block] = formatStoryText('Leo: This is the opening line.\nMira: Echoes arrive.');
    expect(block.type).toBe('dialogue');
    expect(block.speaker).toBe('Leo');
    expect((block as { chunks: InlineChunk[] }).chunks.map(chunk => chunk.text).join(' ')).toContain('This is the opening line.');
  });

  it('combines streaming-style chunks into one paragraph block', () => {
    const blocks = formatStoryText('First chunk. Second sentence continues without blank lines.');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
    expect((blocks[0] as { chunks: InlineChunk[] }).chunks.map(chunk => chunk.text).join('')).toContain('First chunk. Second sentence continues without blank lines.');
  });

  it('ignores malformed emphasis markers', () => {
    const blocks = formatStoryText('Half **bold without closing and *italic* right away.');
    expect(blocks[0].type).toBe('paragraph');
    const chunks = (blocks[0] as { chunks: InlineChunk[] }).chunks;
    const italicChunk = chunks.find(ch => ch.emphasis === 'italic');
    expect(italicChunk?.text).toBe('italic');
    const literallyMarked = chunks.find(ch => ch.text.includes('**bold'));
    expect(literallyMarked).toBeTruthy();
  });
});

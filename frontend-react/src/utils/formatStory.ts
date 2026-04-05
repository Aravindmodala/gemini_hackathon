export type InlineEmphasis = 'italic' | 'bold';

export interface InlineChunk {
  text: string;
  emphasis?: InlineEmphasis;
}

export interface ParagraphBlock {
  type: 'paragraph';
  chunks: InlineChunk[];
}

export interface HeadingBlock {
  type: 'heading';
  chunks: InlineChunk[];
}

export interface DialogueBlock {
  type: 'dialogue';
  speaker?: string;
  chunks: InlineChunk[];
}

export interface SceneDividerBlock {
  type: 'sceneDivider';
  label?: string;
}

export type StoryTextBlock =
  | ParagraphBlock
  | HeadingBlock
  | DialogueBlock
  | SceneDividerBlock;

const SCENE_DIVIDER_REGEX = /^\s*((\*{3,})|(-{3,})|(_{3,})|(scene break)|(act )|(chapter ))\s*$/i;

function normalizeText(input: string): string {
  return input
    .replace(/\r/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\t/g, ' ')
    .trim();
}

function splitIntoSegments(clean: string): string[] {
  return clean
    .split(/\n{2,}/)
    .map(segment => segment.trim())
    .filter(Boolean);
}

function isSceneDivider(segment: string): boolean {
  return SCENE_DIVIDER_REGEX.test(segment);
}

function isHeading(lines: string[]): boolean {
  if (lines.length > 2) {
    return false;
  }
  const joined = lines.join(' ');
  if (/^(chapter|scene|act)\b/i.test(joined)) {
    return true;
  }
  const letters = joined.replace(/[^A-Za-z]/g, '');
  if (!letters) {
    return false;
  }
  const uppercase = letters.replace(/[^A-Z]/g, '').length;
  return letters.length > 3 && uppercase / letters.length > 0.75 && joined.split(' ').length <= 8;
}

function parseDialogue(lines: string[]): { speaker?: string; text: string } | null {
  if (!lines.length) {
    return null;
  }
  const dialogueLinePattern = /^[A-Z][A-Za-z0-9'’\s-]*:/;
  const isDialogue = lines.every(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return dialogueLinePattern.test(trimmed) || trimmed.startsWith('—') || trimmed.startsWith('-');
  });
  if (!isDialogue) {
    return null;
  }

  const firstLine = lines[0].trim();
  const nameMatch = firstLine.match(/^([A-Za-z'’\s-]+):\s*(.*)$/);
  const speaker = nameMatch?.[1].trim();
  const bodyLines = nameMatch ? [nameMatch[2], ...lines.slice(1)] : lines;
  const text = bodyLines.filter(Boolean).join(' ');
  return { speaker, text };
}

function findClosing(text: string, start: number, delimiter: string): number {
  let idx = text.indexOf(delimiter, start);
  while (idx !== -1) {
    const inner = text.slice(start, idx);
    if (/\S/.test(inner)) {
      return idx;
    }
    idx = text.indexOf(delimiter, idx + delimiter.length);
  }
  return -1;
}

function parseInline(text: string): InlineChunk[] {
  const chunks: InlineChunk[] = [];
  let buffer = '';

  const flush = (emphasis?: InlineEmphasis) => {
    if (!buffer) {
      return;
    }
    chunks.push({ text: buffer, emphasis });
    buffer = '';
  };

  let i = 0;
  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const close = findClosing(text, i + 2, '**');
      if (close !== -1) {
        flush();
        const segment = text.slice(i + 2, close);
        chunks.push({ text: segment, emphasis: 'bold' });
        i = close + 2;
        continue;
      }
    }
    if (text[i] === '*') {
      const close = findClosing(text, i + 1, '*');
      if (close !== -1) {
        flush();
        const segment = text.slice(i + 1, close);
        chunks.push({ text: segment, emphasis: 'italic' });
        i = close + 1;
        continue;
      }
    }
    buffer += text[i];
    i += 1;
  }

  flush();
  return chunks;
}

export function formatStoryText(raw: string): StoryTextBlock[] {
  const normalized = normalizeText(raw);
  if (!normalized) {
    return [];
  }

  const segments = splitIntoSegments(normalized);
  const blocks: StoryTextBlock[] = [];

  for (const segment of segments) {
    if (isSceneDivider(segment)) {
      blocks.push({ type: 'sceneDivider', label: segment.replace(/\s+/g, ' ').toUpperCase() });
      continue;
    }

    const lines = segment.split('\n').map(line => line.trim()).filter(Boolean);
    if (!lines.length) {
      continue;
    }

    const combined = lines.join(' ');

    if (isHeading(lines)) {
      blocks.push({ type: 'heading', chunks: parseInline(combined) });
      continue;
    }

    const dialogue = parseDialogue(lines);
    if (dialogue) {
      blocks.push({ type: 'dialogue', speaker: dialogue.speaker, chunks: parseInline(dialogue.text) });
      continue;
    }

    blocks.push({ type: 'paragraph', chunks: parseInline(combined) });
  }

  return blocks;
}

import { useMemo } from 'react';
import { useSessionDetail } from './useSessions';
import { resolveAssetUrl } from '../utils/resolveAssetUrl';
import type { StorySection } from '../types/session';
import type { Interaction, ImageToolResult, MusicToolResult } from '../types/session';

export function useSessionReplay(sessionId: string | null) {
  const { data: detail, isLoading, isError } = useSessionDetail(sessionId);

  const sections = useMemo<StorySection[]>(() => {
    if (!detail) return [];

    // v2 fast path: backend already computed ordered sections
    if (detail.sections && detail.sections.length > 0) {
      return detail.sections.map(section => {
        if (section.type === 'image' || section.type === 'music') {
          return { ...section, url: resolveAssetUrl(section.url) };
        }
        return section;
      }) as StorySection[];
    }

    // v1 legacy reconstruction from interactions[]
    const nextSections: StorySection[] = [];
    let textAccumulator = '';

    const flushText = () => {
      const trimmed = textAccumulator.trim();
      if (trimmed) nextSections.push({ type: 'text', content: trimmed });
      textAccumulator = '';
    };

    for (const interaction of (detail.interactions ?? []) as Interaction[]) {
      if (interaction.role === 'elora' && interaction.text) {
        textAccumulator += interaction.text;
        continue;
      }
      if (interaction.role !== 'tool') continue;

      const args = interaction.args ?? {};
      const imgArgs = args as unknown as ImageToolResult;
      const musArgs = args as unknown as MusicToolResult;

      const imageUrl = imgArgs.image_url ?? imgArgs.url ?? null;
      const musicUrl = musArgs.audio_url ?? musArgs.url ?? null;

      if (
        (interaction.name === 'generate_image' ||
          interaction.name === 'inline_image' ||
          interaction.name === 'generated_image') &&
        imageUrl
      ) {
        flushText();
        nextSections.push({
          type: 'image',
          url: resolveAssetUrl(imageUrl),
          caption: typeof imgArgs.caption === 'string' ? imgArgs.caption : '',
        });
      } else if (interaction.name === 'generate_music' && musicUrl) {
        flushText();
        nextSections.push({
          type: 'music',
          url: resolveAssetUrl(musicUrl),
          duration: musArgs.duration_seconds ?? musArgs.duration ?? 33,
        });
      }
    }

    flushText();
    return nextSections;
  }, [detail]);

  return {
    sections,
    title: detail?.title,
    isLoading,
    isError,
  };
}

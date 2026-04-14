/**
 * StoryPage — Story reading view at `/story/:id` or `/story/live`.
 *
 * - `/story/live`  → shows the live-generating story from the `useStoryteller` hook.
 * - `/story/:id`   → fetches and hydrates a saved session from the API.
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { StoryView } from '../components/story/StoryView';
import { StoryBentoLayout } from '../components/story/StoryBentoLayout';
import { StoryChatbot } from '../components/story/StoryChatbot';
import { resolveAssetUrl } from '../utils/resolveAssetUrl';
import { SIDEBAR_WIDTH } from '../config/layout';
import type { AppOutletContext } from '../App';
import type { StorySection } from '../hooks/useStoryteller';
import type { Interaction, ImageToolResult, MusicToolResult } from '../types/session';

export function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const {
    sections: liveSections,
    status,
    currentMusic,
    storyTitle,
    isSidebarOpen,
    getSessionDetail,
  } = useOutletContext<AppOutletContext>();

  const isLive = id === 'live';

  // ── For saved sessions ──
  const [hydratedSections, setHydratedSections] = useState<StorySection[]>([]);
  const [savedTitle, setSavedTitle] = useState<string | undefined>();
  const [loadError, setLoadError] = useState(false);
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLive || !id) return;
    // Avoid re-fetching if we already loaded this ID
    if (loadedRef.current === id) return;
    loadedRef.current = id;

    (async () => {
      try {
        const detail = await getSessionDetail(id);
        setSavedTitle(detail.title || undefined);

        const nextSections: StorySection[] = [];
        let textAccumulator = '';

        const flushText = () => {
          const trimmed = textAccumulator.trim();
          if (trimmed) nextSections.push({ type: 'text', content: trimmed });
          textAccumulator = '';
        };

        for (const interaction of detail.interactions as Interaction[]) {
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
            (
              interaction.name === 'generate_image'
              || interaction.name === 'inline_image'
              || interaction.name === 'generated_image'
            )
            && imageUrl
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
        setHydratedSections(nextSections);
      } catch (err) {
        console.error('[StoryPage] failed to load session:', err);
        setLoadError(true);
      }
    })();
  }, [id, isLive, getSessionDetail]);

  const sections = isLive ? liveSections : hydratedSections;
  const title = isLive ? (storyTitle ?? undefined) : savedTitle;
  const displayStatus = isLive ? status : 'done';

  const sidebarOffset = isSidebarOpen ? SIDEBAR_WIDTH : 0;

  if (loadError) {
    return (
      <StoryBentoLayout
        sidebarOffset={sidebarOffset}
        storyContent={
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flex: 1, color: '#94a3b8', fontFamily: "'Inter', sans-serif",
            fontSize: 16,
          }}>
            Story not found.
          </div>
        }
        chatContent={<StoryChatbot isStoryGenerating={false} />}
      />
    );
  }

  if (!isLive && hydratedSections.length === 0 && !loadError) {
    return (
      <StoryBentoLayout
        sidebarOffset={sidebarOffset}
        storyContent={
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flex: 1,
          }}>
            <div style={{
              width: 32, height: 32,
              border: '3px solid rgba(124,58,237,0.2)', borderTopColor: '#7c3aed',
              borderRadius: '50%', animation: 'authSpinner 0.8s linear infinite',
            }} />
          </div>
        }
        chatContent={<StoryChatbot storyTitle={title} isStoryGenerating={false} />}
      />
    );
  }

  return (
    <StoryBentoLayout
      sidebarOffset={sidebarOffset}
      storyContent={
        <StoryView
          key={isLive ? 'live' : id}
          sections={sections}
          status={displayStatus}
          currentMusic={currentMusic}
          title={title}
          cardMode
        />
      }
      chatContent={
        <StoryChatbot
          storyTitle={title}
          isStoryGenerating={displayStatus === 'generating'}
        />
      }
    />
  );
}

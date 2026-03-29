/**
 * StoryPage — Story reading view at `/story/:id` or `/story/live`.
 *
 * - `/story/live`  → shows the live-generating story from the `useStoryteller` hook.
 * - `/story/:id`   → fetches and hydrates a saved session from the API.
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { StoryView } from '../components/StoryView';
import { resolveAssetUrl } from '../utils/resolveAssetUrl';
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
        for (const interaction of detail.interactions as Interaction[]) {
          if (interaction.text?.trim()) {
            nextSections.push({ type: 'text', content: interaction.text });
          }
          if (interaction.role !== 'tool') continue;

          const args = interaction.args ?? {};
          const imgArgs = args as unknown as ImageToolResult;
          const musArgs = args as unknown as MusicToolResult;

          const imageUrl = typeof imgArgs.url === 'string' ? imgArgs.url : null;
          const musicUrl = typeof musArgs.audio_url === 'string'
            ? musArgs.audio_url
            : (interaction.name?.toLowerCase().includes('music') && typeof musArgs.url === 'string' ? musArgs.url : null);

          if (imageUrl) {
            nextSections.push({
              type: 'image',
              url: resolveAssetUrl(imageUrl),
              caption: typeof imgArgs.caption === 'string' ? imgArgs.caption : '',
            });
          }
          if (musicUrl) {
            nextSections.push({
              type: 'music',
              url: resolveAssetUrl(musicUrl),
              duration: typeof musArgs.duration === 'number' ? musArgs.duration : 33,
            });
          }
        }

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

  if (loadError) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: '#94a3b8', fontFamily: "'Inter', sans-serif",
        fontSize: 16,
      }}>
        Story not found.
      </div>
    );
  }

  if (!isLive && hydratedSections.length === 0 && !loadError) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh',
      }}>
        <div style={{
          width: 32, height: 32,
          border: '3px solid rgba(124,58,237,0.2)', borderTopColor: '#7c3aed',
          borderRadius: '50%', animation: 'authSpinner 0.8s linear infinite',
        }} />
        <style>{`@keyframes authSpinner { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <StoryView
      key={isLive ? 'live' : id}
      sections={sections}
      status={displayStatus}
      currentMusic={currentMusic}
      title={title}
      sidebarOffset={isSidebarOpen ? 300 : 0}
    />
  );
}

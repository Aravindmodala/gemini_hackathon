/**
 * StoryPage — Story reading view at `/story/:id` or `/story/live`.
 *
 * - `/story/live`  → shows the live-generating story from the `useStoryteller` hook.
 * - `/story/:id`   → fetches and hydrates a saved session via `useSessionReplay`.
 */

import { useParams, useOutletContext } from 'react-router-dom';
import { StoryView } from '../components/story/StoryView';
import { StoryBentoLayout } from '../components/story/StoryBentoLayout';
import { StoryChatbot } from '../components/story/StoryChatbot';
import { SIDEBAR_WIDTH } from '../config/layout';
import { useSessionReplay } from '../hooks/useSessionReplay';
import type { AppOutletContext } from '../App';

export function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const {
    sections: liveSections,
    status,
    currentMusic,
    storyTitle,
    isSidebarOpen,
  } = useOutletContext<AppOutletContext>();

  const isLive = id === 'live';

  const { sections: replaySections, title: replayTitle, isLoading, isError } = useSessionReplay(
    isLive ? null : (id ?? null)
  );

  const sections = isLive ? liveSections : replaySections;
  const title = isLive ? (storyTitle ?? undefined) : replayTitle;
  const displayStatus = isLive ? status : 'done';

  const sidebarOffset = isSidebarOpen ? SIDEBAR_WIDTH : 0;

  if (!isLive && isError) {
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

  if (!isLive && isLoading) {
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

/**
 * HomePage — The landing page shown at `/`.
 *
 * Renders the EmptyState hero and StoryPrompt.
 * Navigates to `/companion` when the user clicks "Talk to Elora".
 * Navigates to `/story/live` when a story prompt is submitted directly.
 */

import { useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { StoryPrompt } from '../components/StoryPrompt';
import type { AppOutletContext } from '../App';

export function HomePage() {
  const navigate = useNavigate();
  const {
    status,
    startStory,
    fetchSessions,
  } = useOutletContext<AppOutletContext>();

  const handleBeginStory = useCallback((prompt: string) => {
    void startStory(prompt);
    void fetchSessions();
    navigate('/story/live');
  }, [startStory, fetchSessions, navigate]);

  const handleTalkToElora = useCallback(() => {
    navigate('/companion');
  }, [navigate]);

  const showPrompt = status === 'idle' || status === 'error';

  return (
    <>
      {status === 'idle' && <EmptyState />}

      {showPrompt && (
        <StoryPrompt
          onSubmit={handleBeginStory}
          disabled={status !== 'idle'}
          onTalkToElora={handleTalkToElora}
        />
      )}
    </>
  );
}

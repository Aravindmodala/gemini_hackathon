/**
 * HomePage — The landing page shown at `/`.
 *
 * Redesigned as a proper two-zone full-screen layout:
 *   - Hero zone (flex:1): animated title + subtitle (EmptyState)
 *   - Prompt zone (flex-shrink:0): story input box (StoryPrompt)
 *
 * No overlap, no fixed-bottom collision.
 */

import { useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { EmptyState } from '../components/layout/EmptyState';
import { StoryPrompt } from '../components/story/StoryPrompt';
import type { AppOutletContext } from '../App';
import styles from './HomePage.module.css';

export function HomePage() {
  const navigate = useNavigate();
  const {
    status,
    startStory,
  } = useOutletContext<AppOutletContext>();

  const handleBeginStory = useCallback((prompt: string) => {
    void startStory(prompt);
    navigate('/story/live');
  }, [startStory, navigate]);

  const handleTalkToElora = useCallback(() => {
    navigate('/companion');
  }, [navigate]);

  const showPrompt = status === 'idle' || status === 'error';

  return (
    <div className={styles.layout}>
      {/* ── Hero zone: cinematic title ──────────────────── */}
      {status === 'idle' && <EmptyState />}

      {/* ── Prompt zone: story input ─────────────────────── */}
      {showPrompt && (
        <div className={styles.promptWrapper}>
          <StoryPrompt
            onSubmit={handleBeginStory}
            disabled={status !== 'idle'}
            onTalkToElora={handleTalkToElora}
          />
        </div>
      )}
    </div>
  );
}

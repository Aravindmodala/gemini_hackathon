import { useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { EmptyState } from '../components/layout/EmptyState';
import { ProfileButton } from '../components/layout/ProfileButton';
import { StoryPrompt } from '../components/story/StoryPrompt';
import { useUserProfile } from '../hooks/useUserProfile';
import type { AppOutletContext } from '../App';
import styles from './HomePage.module.css';

export function HomePage() {
  const navigate = useNavigate();
  const {
    status,
    startStory,
  } = useOutletContext<AppOutletContext>();

  const { profile } = useUserProfile();

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
      <ProfileButton profile={profile} />

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

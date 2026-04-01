import type { ReactNode } from 'react';
import styles from './StoryBentoLayout.module.css';

interface StoryBentoLayoutProps {
  sidebarOffset: number;
  storyContent: ReactNode;
  chatContent: ReactNode;
}

export function StoryBentoLayout({ sidebarOffset, storyContent, chatContent }: StoryBentoLayoutProps) {
  // When sidebar is closed (sidebarOffset=0), reserve 60px on the left so the
  // fixed toggle button (left:16, width:36 → ends at x=52) doesn't overlap the card.
  const paddingLeft = sidebarOffset === 0 ? 60 : 20;
  return (
    <div className={styles.bentoContainer} style={{ left: sidebarOffset, paddingLeft }}>
      <div className={styles.bentoCard} aria-label="Story content">
        {storyContent}
      </div>
      <div className={styles.bentoCard} role="complementary" aria-label="Story chat">
        {chatContent}
      </div>
    </div>
  );
}

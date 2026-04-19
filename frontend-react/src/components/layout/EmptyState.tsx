/**
 * EmptyState — Cinematic hero section for the home page.
 *
 * Redesigned as a non-fixed flex child that fills the hero zone of
 * the HomePage layout. Features animated gradient title, floating
 * stars, ambient glow blobs and entrance animations.
 */

import styles from './EmptyState.module.css';

const STARS = [
  { style: { left: '8%',  top: '18%',   fontSize: 14, animationDelay: '0s',   animationDuration: '5s' } },
  { style: { right: '10%', top: '22%',  fontSize: 12, animationDelay: '1s',   animationDuration: '6s' } },
  { style: { left: '20%', bottom: '22%', fontSize: 10, animationDelay: '2s',  animationDuration: '5.5s' } },
  { style: { right: '20%', bottom: '28%', fontSize: 10, animationDelay: '0.5s', animationDuration: '7s' } },
  { style: { left: '48%', top: '5%',   fontSize: 8,  animationDelay: '1.5s', animationDuration: '6.5s' } },
  { style: { right: '35%', top: '10%', fontSize: 9,  animationDelay: '2.5s', animationDuration: '5s' } },
];

export function EmptyState() {
  return (
    <div className={styles.root}>
      {/* Ambient glow blobs */}
      <div className={styles.glowPurple} />
      <div className={styles.glowTeal} />
      <div className={styles.glowWarm} />

      {/* Floating stars */}
      {STARS.map((s, i) => (
        <span key={i} className={styles.star} style={s.style} aria-hidden="true">
          ✦
        </span>
      ))}

      {/* Hero content */}
      <div className={styles.content}>
        <p className={styles.eyebrow}>Illustrated AI Storytelling</p>

        <h1 className={styles.title}>
          The Emotional<br />Chronicler
        </h1>

        {/* Ornamental divider */}
        <div className={styles.divider} aria-hidden="true">
          <span className={styles.dividerLine} />
          <span className={styles.dividerGem}>✦</span>
          <span className={styles.dividerLine} />
        </div>

      </div>
    </div>
  );
}

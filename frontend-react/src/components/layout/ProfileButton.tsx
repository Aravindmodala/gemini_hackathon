import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { UserProfile } from '../../types/user';
import { ProfileMenu } from './ProfileMenu';
import styles from './ProfileButton.module.css';

interface ProfileButtonProps {
  profile: UserProfile | null;
}

export function ProfileButton({ profile }: ProfileButtonProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isMenuOpen]);

  const handleToggle = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  const handleProfile = useCallback(() => {
    navigate('/settings?tab=profile');
    setIsMenuOpen(false);
  }, [navigate]);

  const handleSettings = useCallback(() => {
    navigate('/settings');
    setIsMenuOpen(false);
  }, [navigate]);

  const handleSignOut = useCallback(async () => {
    setIsMenuOpen(false);
    await signOut();
  }, [signOut]);

  if (!profile) return null;

  const name = profile.display_name || profile.email || '?';
  const initial = (name[0] ?? '?').toUpperCase();

  return (
    <div ref={containerRef} className={styles.container}>
      <button
        className={styles.avatarBtn}
        onClick={handleToggle}
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
      >
        {profile.photo_url ? (
          <img
            src={profile.photo_url}
            alt="Profile avatar"
            referrerPolicy="no-referrer"
            className={styles.avatarImg}
          />
        ) : (
          <span className={styles.avatarFallback}>{initial}</span>
        )}
      </button>

      {isMenuOpen && (
        <ProfileMenu
          onClose={handleClose}
          onProfile={handleProfile}
          onSettings={handleSettings}
          onSignOut={handleSignOut}
        />
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfile } from '../hooks/useUserProfile';
import { emptyPreferences, type UserPreferences } from '../types/user';
import { LiteraryDNAStep } from '../components/onboarding/steps/LiteraryDNAStep';
import { MoodStep } from '../components/onboarding/steps/MoodStep';
import styles from './SettingsPage.module.css';

type TabId = 'profile' | 'story' | 'account';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'profile', label: 'Profile' },
  { id: 'story', label: 'Story preferences' },
  { id: 'account', label: 'Account' },
];

const SAVED_TOAST_MS = 2000;

function parseTab(raw: string | null): TabId {
  const match = TABS.find((tab) => tab.id === raw);
  return match ? match.id : 'profile';
}

export function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, signOut } = useAuth();
  const {
    profile,
    isLoading,
    isFetching,
    refetch,
    updateProfile,
    isUpdating,
  } = useUserProfile();

  // Always pull the latest server state when Settings opens so the story
  // preferences chips reflect what was actually saved during onboarding.
  useEffect(() => {
    void refetch();
  }, [refetch]);

  const activeTab = parseTab(searchParams.get('tab'));

  const savedPreferences = useMemo<UserPreferences>(
    () => profile?.preferences ?? emptyPreferences(),
    [profile],
  );

  const [preferences, setPreferences] = useState<UserPreferences>(savedPreferences);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Sync from server only when the form is clean (prevents background
  // refetches from clobbering in-progress edits).
  useEffect(() => {
    if (!isDirty) {
      setPreferences(savedPreferences);
    }
  }, [savedPreferences, isDirty]);

  useEffect(() => {
    if (savedAt == null) return;
    const timer = window.setTimeout(() => setSavedAt(null), SAVED_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [savedAt]);

  const selectTab = useCallback(
    (tab: TabId) => {
      setSearchParams({ tab }, { replace: true });
    },
    [setSearchParams],
  );

  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    profile: null,
    story: null,
    account: null,
  });

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = (currentIndex + delta + TABS.length) % TABS.length;
      const nextTab = TABS[nextIndex].id;
      selectTab(nextTab);
      tabRefs.current[nextTab]?.focus();
    },
    [activeTab, selectTab],
  );

  const patchPreferences = useCallback((patch: Partial<UserPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...patch }));
    setIsDirty(true);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    try {
      await updateProfile({ preferences });
      setIsDirty(false);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save preferences');
    }
  }, [updateProfile, preferences]);

  const handleReset = useCallback(() => {
    setPreferences(savedPreferences);
    setIsDirty(false);
    setSaveError(null);
    setSavedAt(null);
  }, [savedPreferences]);

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const handleBackHome = useCallback(() => {
    navigate('/');
  }, [navigate]);

  if (profile == null && isLoading) {
    return (
      <div className={styles.layout}>
        <div className={styles.card}>
          <div className={styles.loading}>Loading your profile…</div>
        </div>
      </div>
    );
  }

  const displayName = profile?.display_name || user?.displayName || null;
  const email = profile?.email || user?.email || null;
  const photoUrl = profile?.photo_url || user?.photoURL || null;
  const initial = (displayName || email || '?')[0]?.toUpperCase() ?? '?';

  return (
    <div className={styles.layout}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Settings</h1>
          <div className={styles.headerRight}>
            {isFetching && profile != null && (
              <span className={styles.refreshing} aria-live="polite">Refreshing…</span>
            )}
            <button
              type="button"
              className={styles.btnGhost}
              onClick={handleBackHome}
              aria-label="Back to home"
            >
              <span aria-hidden="true">←</span> Back to home
            </button>
          </div>
        </div>

        <div
          className={styles.tabBar}
          role="tablist"
          aria-label="Settings sections"
          onKeyDown={handleTabKeyDown}
        >
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`settings-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`settings-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                ref={(node) => {
                  tabRefs.current[tab.id] = node;
                }}
                className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                onClick={() => selectTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'profile' && (
          <div
            className={styles.panel}
            role="tabpanel"
            id="settings-panel-profile"
            aria-labelledby="settings-tab-profile"
            tabIndex={0}
          >
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Your profile</h2>
              <p className={styles.sectionSubtitle}>
                How you appear in the app. Editing coming soon.
              </p>
            </div>

            <div className={styles.profileBlock}>
              <div className={styles.avatar}>
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt="Profile avatar"
                    referrerPolicy="no-referrer"
                    className={styles.avatarImg}
                  />
                ) : (
                  <span>{initial}</span>
                )}
              </div>
              <div className={styles.profileInfo}>
                <div className={styles.profileName}>
                  {displayName || 'Unnamed wanderer'}
                </div>
                <div className={styles.profileEmail}>{email || 'No email on file'}</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'story' && (
          <div
            className={styles.panel}
            role="tabpanel"
            id="settings-panel-story"
            aria-labelledby="settings-tab-story"
            tabIndex={0}
          >
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Story preferences</h2>
              <p className={styles.sectionSubtitle}>
                Tune the kinds of stories we craft for you. All fields are optional.
              </p>
            </div>

            <div className={styles.fields}>
              <LiteraryDNAStep preferences={preferences} onChange={patchPreferences} />
              <MoodStep preferences={preferences} onChange={patchPreferences} />
            </div>

            <div className={styles.footer}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleReset}
                disabled={isUpdating || !isDirty}
              >
                Reset
              </button>

              <div className={styles.footerSpacer} />

              {saveError && (
                <span className={styles.statusError} role="alert">
                  {saveError}
                </span>
              )}
              {savedAt != null && !saveError && (
                <span
                  key={savedAt}
                  className={styles.statusSaved}
                  role="status"
                  aria-live="polite"
                >
                  Saved
                </span>
              )}

              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleSave}
                disabled={isUpdating || !isDirty}
              >
                {isUpdating ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'account' && (
          <div
            className={styles.panel}
            role="tabpanel"
            id="settings-panel-account"
            aria-labelledby="settings-tab-account"
            tabIndex={0}
          >
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Account</h2>
              <p className={styles.sectionSubtitle}>
                Manage your session. More options coming soon.
              </p>
            </div>

            <div className={styles.profileBlock}>
              <div className={styles.profileInfo}>
                <div className={styles.profileName}>Signed in as</div>
                <div className={styles.profileEmail}>{email || 'No email on file'}</div>
              </div>
            </div>

            <div className={styles.footer}>
              <div className={styles.footerSpacer} />
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

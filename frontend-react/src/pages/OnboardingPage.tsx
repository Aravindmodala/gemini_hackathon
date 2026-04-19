import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingWizard } from '../components/onboarding/OnboardingWizard';
import { useUserProfile } from '../hooks/useUserProfile';
import { emptyPreferences, type UserPreferences } from '../types/user';
import styles from './OnboardingPage.module.css';

export function OnboardingPage() {
  const navigate = useNavigate();
  const {
    profile,
    isLoading,
    completeOnboarding,
    skipOnboarding,
    isCompleting,
    isSkipping,
  } = useUserProfile();

  useEffect(() => {
    if (profile?.onboarded_at != null) {
      navigate('/', { replace: true });
    }
  }, [profile?.onboarded_at, navigate]);

  const handleComplete = useCallback(
    async (preferences: UserPreferences) => {
      await completeOnboarding({ preferences });
      navigate('/', { replace: true });
    },
    [completeOnboarding, navigate],
  );

  const handleSkip = useCallback(async () => {
    await skipOnboarding();
    navigate('/', { replace: true });
  }, [skipOnboarding, navigate]);

  const submitting = isCompleting || isSkipping;

  if ((profile == null && isLoading) || profile?.onboarded_at != null) {
    return (
      <div className={styles.layout}>
        <div className={styles.card}>
          <div className={styles.loading}>Loading your profile…</div>
        </div>
      </div>
    );
  }

  const initialPreferences = profile?.preferences ?? emptyPreferences();

  return (
    <div className={styles.layout}>
      <div className={styles.card}>
        <OnboardingWizard
          initialPreferences={initialPreferences}
          onComplete={handleComplete}
          onSkip={handleSkip}
          isSubmitting={submitting}
        />
      </div>
    </div>
  );
}

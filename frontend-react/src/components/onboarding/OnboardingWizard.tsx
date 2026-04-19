import { useCallback, useReducer, useState } from 'react';
import type { UserPreferences } from '../../types/user';
import { LiteraryDNAStep } from './steps/LiteraryDNAStep';
import { MoodStep } from './steps/MoodStep';
import styles from './OnboardingWizard.module.css';

interface OnboardingWizardProps {
  initialPreferences: UserPreferences;
  onComplete: (prefs: UserPreferences) => Promise<void> | void;
  onSkip: () => Promise<void> | void;
  isSubmitting?: boolean;
}

type PrefsAction = { type: 'patch'; patch: Partial<UserPreferences> };

function prefsReducer(state: UserPreferences, action: PrefsAction): UserPreferences {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    default:
      return state;
  }
}

type Step = 1 | 2;

const STEP_TITLES: Record<Step, string> = {
  1: 'Your literary DNA',
  2: 'The mood you crave',
};

export function OnboardingWizard({
  initialPreferences,
  onComplete,
  onSkip,
  isSubmitting = false,
}: OnboardingWizardProps) {
  const [preferences, dispatch] = useReducer(prefsReducer, initialPreferences);
  const [step, setStep] = useState<Step>(1);

  const handlePatch = useCallback((patch: Partial<UserPreferences>) => {
    dispatch({ type: 'patch', patch });
  }, []);

  const handleBack = useCallback(() => {
    setStep((prev) => (prev === 2 ? 1 : prev));
  }, []);

  const handleNext = useCallback(() => {
    setStep(2);
  }, []);

  const handleSave = useCallback(() => {
    void onComplete(preferences);
  }, [onComplete, preferences]);

  const handleSkip = useCallback(() => {
    void onSkip();
  }, [onSkip]);

  const progressPercent = step === 1 ? 50 : 100;

  return (
    <div className={styles.wizard}>
      <div className={styles.progress}>
        <div className={styles.progressLabel}>
          {`Step ${step} of 2 · ${STEP_TITLES[step]}`}
        </div>
        <div className={styles.progressBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
          <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className={styles.stepBody}>
        {step === 1 ? (
          <LiteraryDNAStep preferences={preferences} onChange={handlePatch} />
        ) : (
          <MoodStep preferences={preferences} onChange={handlePatch} />
        )}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={handleBack}
          disabled={isSubmitting || step === 1}
        >
          Back
        </button>

        <div className={styles.footerSpacer} />

        <button
          type="button"
          className={styles.btnGhost}
          onClick={handleSkip}
          disabled={isSubmitting}
        >
          Skip for now
        </button>

        {step === 1 ? (
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleNext}
            disabled={isSubmitting}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleSave}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving…' : 'Save & continue'}
          </button>
        )}
      </div>
    </div>
  );
}

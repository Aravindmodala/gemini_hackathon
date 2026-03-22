/**
 * Unit tests for the Zustand avatar store.
 *
 * Validates state defaults, setter actions, and state isolation.
 */
import { useAvatarStore } from '../../store/useAvatarStore';

describe('useAvatarStore', () => {
  // Reset store to defaults before each test
  beforeEach(() => {
    useAvatarStore.setState({
      currentAction: 'Idle',
      currentEmotion: 'neutral',
      lipSyncVolume: 0,
    });
  });

  // ── Default State ─────────────────────────────────────────
  describe('initial state', () => {
    it('should have "Idle" as the default action', () => {
      expect(useAvatarStore.getState().currentAction).toBe('Idle');
    });

    it('should have "neutral" as the default emotion', () => {
      expect(useAvatarStore.getState().currentEmotion).toBe('neutral');
    });

    it('should have 0 as the default lipSyncVolume', () => {
      expect(useAvatarStore.getState().lipSyncVolume).toBe(0);
    });
  });

  // ── setAction ─────────────────────────────────────────────
  describe('setAction', () => {
    it('should update currentAction to "Speaking"', () => {
      useAvatarStore.getState().setAction('Speaking');
      expect(useAvatarStore.getState().currentAction).toBe('Speaking');
    });

    it('should update currentAction to "Listening"', () => {
      useAvatarStore.getState().setAction('Listening');
      expect(useAvatarStore.getState().currentAction).toBe('Listening');
    });

    it('should update currentAction to "Talking"', () => {
      useAvatarStore.getState().setAction('Talking');
      expect(useAvatarStore.getState().currentAction).toBe('Talking');
    });

    it('should handle arbitrary action strings', () => {
      useAvatarStore.getState().setAction('CustomAnimation');
      expect(useAvatarStore.getState().currentAction).toBe('CustomAnimation');
    });
  });

  // ── setEmotion ────────────────────────────────────────────
  describe('setEmotion', () => {
    it('should set emotion to "happy"', () => {
      useAvatarStore.getState().setEmotion('happy');
      expect(useAvatarStore.getState().currentEmotion).toBe('happy');
    });

    it('should set emotion to "sad"', () => {
      useAvatarStore.getState().setEmotion('sad');
      expect(useAvatarStore.getState().currentEmotion).toBe('sad');
    });

    it('should set emotion to "surprised"', () => {
      useAvatarStore.getState().setEmotion('surprised');
      expect(useAvatarStore.getState().currentEmotion).toBe('surprised');
    });

    it('should set emotion back to "neutral"', () => {
      useAvatarStore.getState().setEmotion('happy');
      useAvatarStore.getState().setEmotion('neutral');
      expect(useAvatarStore.getState().currentEmotion).toBe('neutral');
    });
  });

  // ── setLipSyncVolume ──────────────────────────────────────
  describe('setLipSyncVolume', () => {
    it('should set lipSyncVolume to a value between 0 and 1', () => {
      useAvatarStore.getState().setLipSyncVolume(0.75);
      expect(useAvatarStore.getState().lipSyncVolume).toBe(0.75);
    });

    it('should handle volume at 0', () => {
      useAvatarStore.getState().setLipSyncVolume(0);
      expect(useAvatarStore.getState().lipSyncVolume).toBe(0);
    });

    it('should handle volume at 1', () => {
      useAvatarStore.getState().setLipSyncVolume(1);
      expect(useAvatarStore.getState().lipSyncVolume).toBe(1);
    });

    it('should update rapidly (simulating real-time audio analysis)', () => {
      for (let i = 0; i <= 10; i++) {
        useAvatarStore.getState().setLipSyncVolume(i / 10);
      }
      expect(useAvatarStore.getState().lipSyncVolume).toBe(1);
    });
  });

  // ── State Isolation ───────────────────────────────────────
  describe('state isolation', () => {
    it('setting action should not affect emotion or volume', () => {
      useAvatarStore.getState().setEmotion('happy');
      useAvatarStore.getState().setLipSyncVolume(0.5);
      useAvatarStore.getState().setAction('Speaking');

      expect(useAvatarStore.getState().currentEmotion).toBe('happy');
      expect(useAvatarStore.getState().lipSyncVolume).toBe(0.5);
    });

    it('setting emotion should not affect action or volume', () => {
      useAvatarStore.getState().setAction('Speaking');
      useAvatarStore.getState().setLipSyncVolume(0.8);
      useAvatarStore.getState().setEmotion('sad');

      expect(useAvatarStore.getState().currentAction).toBe('Speaking');
      expect(useAvatarStore.getState().lipSyncVolume).toBe(0.8);
    });
  });
});

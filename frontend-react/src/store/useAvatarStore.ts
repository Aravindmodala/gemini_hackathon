import { create } from 'zustand';

interface AvatarState {
  currentAction: 'Idle' | 'Speaking' | 'Listening' | string;
  currentEmotion: 'neutral' | 'happy' | 'sad' | 'surprised' | string;
  lipSyncVolume: number;
  setAction: (action: string) => void;
  setEmotion: (emotion: string) => void;
  setLipSyncVolume: (volume: number) => void;
}

export const useAvatarStore = create<AvatarState>((set) => ({
  currentAction: 'Idle',
  currentEmotion: 'neutral',
  lipSyncVolume: 0,
  setAction: (action) => set({ currentAction: action }),
  setEmotion: (emotion) => set({ currentEmotion: emotion }),
  setLipSyncVolume: (volume) => set({ lipSyncVolume: volume }),
}));

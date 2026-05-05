import { create } from 'zustand';

interface SettingsState {
  soundVolume: number;
  soundEnabled: boolean;
  colorBlindMode: boolean;
  setSoundVolume: (v: number) => void;
  toggleSound: () => void;
  toggleColorBlind: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  soundVolume: parseFloat(localStorage.getItem('soundVolume') ?? '0.7'),
  soundEnabled: localStorage.getItem('soundEnabled') !== 'false',
  colorBlindMode: localStorage.getItem('colorBlindMode') === 'true',
  setSoundVolume: (v) => {
    localStorage.setItem('soundVolume', String(v));
    set({ soundVolume: v });
  },
  toggleSound: () => set((s) => {
    const next = !s.soundEnabled;
    localStorage.setItem('soundEnabled', String(next));
    return { soundEnabled: next };
  }),
  toggleColorBlind: () => set((s) => {
    const next = !s.colorBlindMode;
    localStorage.setItem('colorBlindMode', String(next));
    return { colorBlindMode: next };
  }),
}));

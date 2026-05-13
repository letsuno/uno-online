import { create } from 'zustand';

interface SettingsState {
  soundVolume: number;
  soundEnabled: boolean;
  bgmEnabled: boolean;
  bgmVolume: number;
  colorBlindMode: boolean;
  cardImagePack: boolean;
  autoPlay: boolean;
  setSoundVolume: (v: number) => void;
  toggleSound: () => void;
  toggleBgm: () => void;
  setBgmVolume: (v: number) => void;
  toggleColorBlind: () => void;
  setCardImagePack: (loaded: boolean) => void;
  toggleAutoPlay: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  soundVolume: parseFloat(localStorage.getItem('soundVolume') ?? '0.7'),
  soundEnabled: localStorage.getItem('soundEnabled') !== 'false',
  bgmEnabled: localStorage.getItem('bgmEnabled') !== 'false',
  bgmVolume: parseFloat(localStorage.getItem('bgmVolume') ?? '0.3'),
  colorBlindMode: localStorage.getItem('colorBlindMode') === 'true',
  cardImagePack: localStorage.getItem('cardImagePack') === 'true',
  autoPlay: localStorage.getItem('autoPlay') === 'true',
  setSoundVolume: (v) => {
    localStorage.setItem('soundVolume', String(v));
    set({ soundVolume: v });
  },
  toggleSound: () => set((s) => {
    const next = !s.soundEnabled;
    localStorage.setItem('soundEnabled', String(next));
    return { soundEnabled: next };
  }),
  toggleBgm: () => set((s) => {
    const next = !s.bgmEnabled;
    localStorage.setItem('bgmEnabled', String(next));
    return { bgmEnabled: next };
  }),
  setBgmVolume: (v) => {
    localStorage.setItem('bgmVolume', String(v));
    set({ bgmVolume: v });
  },
  toggleColorBlind: () => set((s) => {
    const next = !s.colorBlindMode;
    localStorage.setItem('colorBlindMode', String(next));
    return { colorBlindMode: next };
  }),
  setCardImagePack: (loaded) => {
    localStorage.setItem('cardImagePack', String(loaded));
    set({ cardImagePack: loaded });
  },
  toggleAutoPlay: () => set((s) => {
    const next = !s.autoPlay;
    localStorage.setItem('autoPlay', String(next));
    return { autoPlay: next };
  }),
}));

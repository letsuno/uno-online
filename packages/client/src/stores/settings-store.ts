import { create } from 'zustand';

export type FontOption = 'default' | 'rounded' | 'serif' | 'mono';

export const FONT_OPTIONS: Record<FontOption, { label: string; value: string }> = {
  default: { label: '默认', value: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive, sans-serif" },
  rounded: { label: '圆体', value: "system-ui, -apple-system, 'Noto Sans SC', sans-serif" },
  serif: { label: '衬线', value: "'Georgia', 'Noto Serif SC', 'Times New Roman', serif" },
  mono: { label: '等宽', value: "'Fira Code', 'Cascadia Code', 'Consolas', monospace" },
};

interface SettingsState {
  soundVolume: number;
  soundEnabled: boolean;
  colorBlindMode: boolean;
  fontFamily: FontOption;
  setSoundVolume: (v: number) => void;
  toggleSound: () => void;
  toggleColorBlind: () => void;
  setFontFamily: (f: FontOption) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  soundVolume: parseFloat(localStorage.getItem('soundVolume') ?? '0.7'),
  soundEnabled: localStorage.getItem('soundEnabled') !== 'false',
  colorBlindMode: localStorage.getItem('colorBlindMode') === 'true',
  fontFamily: (localStorage.getItem('fontFamily') as FontOption) || 'default',
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
  setFontFamily: (f) => {
    localStorage.setItem('fontFamily', f);
    document.documentElement.style.setProperty('--font-game', FONT_OPTIONS[f].value);
    document.documentElement.style.setProperty('--font-ui', FONT_OPTIONS[f].value);
    set({ fontFamily: f });
  },
}));

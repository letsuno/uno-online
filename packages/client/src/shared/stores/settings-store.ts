import { create } from 'zustand';
import { loadBuiltinTheme, loadCardPack, clearCardPack, type BuiltinCardTheme } from '../utils/card-images';

export type CardTheme = 'default' | BuiltinCardTheme | 'custom';

const BUILTIN_THEMES: readonly CardTheme[] = ['retro', 'minimal', 'neon'];

function readStoredCardTheme(): CardTheme {
  const stored = localStorage.getItem('cardTheme');
  if (stored === 'default' || stored === 'custom' || BUILTIN_THEMES.includes(stored as CardTheme)) {
    return stored as CardTheme;
  }
  return 'default';
}

interface SettingsState {
  soundVolume: number;
  soundEnabled: boolean;
  bgmEnabled: boolean;
  bgmVolume: number;
  colorBlindMode: boolean;
  /** 卡面主题：default 为代码绘制；内置主题走静态资源包；custom 为用户上传 ZIP（会话级） */
  cardTheme: CardTheme;
  /** 非 default 主题的图片资源是否已装载（未装载时回退到绘制卡面） */
  cardThemeReady: boolean;
  autoPlay: boolean;
  setSoundVolume: (v: number) => void;
  toggleSound: () => void;
  toggleBgm: () => void;
  setBgmVolume: (v: number) => void;
  toggleColorBlind: () => void;
  setCardTheme: (theme: CardTheme, file?: File) => Promise<void>;
  toggleAutoPlay: () => void;
}

/** 主题切换竞态保护：只有最后一次切换的加载结果生效 */
let themeLoadToken = 0;

export const useSettingsStore = create<SettingsState>((set) => ({
  soundVolume: parseFloat(localStorage.getItem('soundVolume') ?? '0.7'),
  soundEnabled: localStorage.getItem('soundEnabled') !== 'false',
  bgmEnabled: localStorage.getItem('bgmEnabled') !== 'false',
  bgmVolume: parseFloat(localStorage.getItem('bgmVolume') ?? '0.3'),
  colorBlindMode: localStorage.getItem('colorBlindMode') === 'true',
  cardTheme: readStoredCardTheme(),
  cardThemeReady: false,
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
  setCardTheme: async (theme, file) => {
    const token = ++themeLoadToken;
    localStorage.setItem('cardTheme', theme);
    if (theme === 'default') {
      clearCardPack();
      set({ cardTheme: 'default', cardThemeReady: false });
      return;
    }
    set({ cardTheme: theme, cardThemeReady: false });
    try {
      if (theme === 'custom') {
        if (!file) return; // 持久化的 custom 无法恢复内容，等用户重新上传
        await loadCardPack(file);
      } else {
        await loadBuiltinTheme(theme);
      }
      if (token === themeLoadToken) set({ cardThemeReady: true });
    } catch (err) {
      console.error('卡面主题加载失败，回退默认卡面', theme, err);
      if (token === themeLoadToken) {
        clearCardPack();
        localStorage.setItem('cardTheme', 'default');
        set({ cardTheme: 'default', cardThemeReady: false });
      }
    }
  },
  toggleAutoPlay: () => set((s) => {
    const next = !s.autoPlay;
    localStorage.setItem('autoPlay', String(next));
    return { autoPlay: next };
  }),
}));

/** 应用启动时恢复持久化的内置主题（custom 内容不持久化，保持回退绘制卡面） */
export function initCardTheme(): void {
  localStorage.removeItem('cardImagePack'); // 清理旧版开关
  const { cardTheme, setCardTheme } = useSettingsStore.getState();
  if (BUILTIN_THEMES.includes(cardTheme)) {
    void setCardTheme(cardTheme);
  }
}

import { create } from 'zustand';
import { loadBuiltinTheme, loadCardPack, clearCardPack, type BuiltinCardTheme } from '../utils/card-images';

export type CardTheme = 'default' | BuiltinCardTheme | 'custom';

const BUILTIN_THEMES: readonly CardTheme[] = ['retro', 'minimal', 'neon'];
const DEFAULT_SOUND_VOLUME = 0.7;
const DEFAULT_BGM_VOLUME = 0.3;

function readStoredBoolean(key: string, fallback: boolean): boolean {
  const stored = localStorage.getItem(key);
  if (stored === null) return fallback;
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  localStorage.removeItem(key);
  return fallback;
}

function readStoredVolume(key: string, fallback: number): number {
  const stored = localStorage.getItem(key);
  if (stored === null) return fallback;
  const value = Number(stored);
  if (Number.isFinite(value) && value >= 0 && value <= 1) return value;
  localStorage.removeItem(key);
  return fallback;
}

function assertVolume(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('音量必须是 0 到 1 之间的有限数值');
  }
}

function readStoredCardTheme(): CardTheme {
  const stored = localStorage.getItem('cardTheme');
  if (stored === 'default' || BUILTIN_THEMES.includes(stored as CardTheme)) {
    return stored as CardTheme;
  }
  if (stored !== null) localStorage.removeItem('cardTheme');
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
  setSoundVolume: (v: number) => void;
  toggleSound: () => void;
  toggleBgm: () => void;
  setBgmVolume: (v: number) => void;
  toggleColorBlind: () => void;
  setCardTheme: (theme: CardTheme, file?: File) => Promise<void>;
}

/** 主题切换竞态保护：只有最后一次切换的加载结果生效 */
let themeLoadToken = 0;

export const useSettingsStore = create<SettingsState>(set => ({
  soundVolume: readStoredVolume('soundVolume', DEFAULT_SOUND_VOLUME),
  soundEnabled: readStoredBoolean('soundEnabled', true),
  bgmEnabled: readStoredBoolean('bgmEnabled', true),
  bgmVolume: readStoredVolume('bgmVolume', DEFAULT_BGM_VOLUME),
  colorBlindMode: readStoredBoolean('colorBlindMode', false),
  cardTheme: readStoredCardTheme(),
  cardThemeReady: false,
  setSoundVolume: v => {
    assertVolume(v);
    localStorage.setItem('soundVolume', String(v));
    set({ soundVolume: v });
  },
  toggleSound: () =>
    set(s => {
      const next = !s.soundEnabled;
      localStorage.setItem('soundEnabled', String(next));
      return { soundEnabled: next };
    }),
  toggleBgm: () =>
    set(s => {
      const next = !s.bgmEnabled;
      localStorage.setItem('bgmEnabled', String(next));
      return { bgmEnabled: next };
    }),
  setBgmVolume: v => {
    assertVolume(v);
    localStorage.setItem('bgmVolume', String(v));
    set({ bgmVolume: v });
  },
  toggleColorBlind: () =>
    set(s => {
      const next = !s.colorBlindMode;
      localStorage.setItem('colorBlindMode', String(next));
      return { colorBlindMode: next };
    }),
  setCardTheme: async (theme, file) => {
    const token = ++themeLoadToken;
    if (theme === 'default') {
      localStorage.setItem('cardTheme', theme);
      clearCardPack();
      set({ cardTheme: 'default', cardThemeReady: false });
      return;
    }
    // Custom ZIP contents only exist in memory. Keep the last durable built-in
    // preference so a reload never tries to restore an unavailable custom pack.
    if (theme !== 'custom') localStorage.setItem('cardTheme', theme);
    set({ cardTheme: theme, cardThemeReady: false });
    try {
      if (theme === 'custom') {
        if (!file) throw new Error('自定义卡面需要 ZIP 文件');
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
}));

/** 应用启动时恢复持久化的内置主题。 */
export function initCardTheme(): void {
  const { cardTheme, setCardTheme } = useSettingsStore.getState();
  if (BUILTIN_THEMES.includes(cardTheme)) {
    void setCardTheme(cardTheme);
  }
}

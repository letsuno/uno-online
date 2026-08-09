import { beforeEach, describe, expect, it, vi } from 'vitest';

const cardImages = vi.hoisted(() => ({
  loadBuiltinTheme: vi.fn(),
  loadCardPack: vi.fn(),
  clearCardPack: vi.fn(),
}));

vi.mock('../src/shared/utils/card-images', () => cardImages);

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', createMemoryStorage());
});

describe('settings storage', () => {
  it('removes invalid current values instead of partially accepting them', async () => {
    localStorage.setItem('soundVolume', 'NaN');
    localStorage.setItem('soundEnabled', 'yes');
    localStorage.setItem('bgmVolume', '2');
    localStorage.setItem('cardTheme', 'custom');

    const { useSettingsStore } = await import('../src/shared/stores/settings-store');
    const state = useSettingsStore.getState();

    expect(state.soundVolume).toBe(0.7);
    expect(state.soundEnabled).toBe(true);
    expect(state.bgmVolume).toBe(0.3);
    expect(state.cardTheme).toBe('default');
    for (const key of ['soundVolume', 'soundEnabled', 'bgmVolume', 'cardTheme']) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });

  it('keeps custom theme contents session-only', async () => {
    localStorage.setItem('cardTheme', 'retro');
    const { useSettingsStore } = await import('../src/shared/stores/settings-store');

    await useSettingsStore.getState().setCardTheme('custom', {} as File);

    expect(useSettingsStore.getState().cardTheme).toBe('custom');
    expect(localStorage.getItem('cardTheme')).toBe('retro');
    expect(cardImages.loadCardPack).toHaveBeenCalledOnce();
  });

  it('rejects invalid volume writes', async () => {
    const { useSettingsStore } = await import('../src/shared/stores/settings-store');

    expect(() => useSettingsStore.getState().setSoundVolume(Number.NaN)).toThrow(RangeError);
    expect(() => useSettingsStore.getState().setBgmVolume(1.1)).toThrow(RangeError);
  });
});

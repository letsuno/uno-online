import { create } from 'zustand';

export interface HotkeyAction {
  id: string;
  label: string;
  defaultKey?: string;
  defaultCode?: string;
  repeat?: boolean;
}

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  { id: 'autopilot_once', label: '单步托管', defaultCode: 'Space' },
  { id: 'toggle_info', label: '信息面板', defaultKey: 'h' },
  { id: 'open_chat', label: '打开聊天', defaultKey: 'Enter', repeat: true },
];

export interface HotkeyOverride {
  key?: string;
  code?: string;
}

const STORAGE_KEY = 'hotkeyOverrides';

function loadOverrides(): Record<string, HotkeyOverride> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, HotkeyOverride>;
  } catch { /* ignore */ }
  return {};
}

function saveOverrides(overrides: Record<string, HotkeyOverride>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

interface HotkeyState {
  overrides: Record<string, HotkeyOverride>;
  setHotkey: (actionId: string, override: HotkeyOverride) => void;
  resetHotkey: (actionId: string) => void;
  resetAll: () => void;
}

export const useHotkeyStore = create<HotkeyState>((set) => ({
  overrides: loadOverrides(),
  setHotkey: (actionId, override) =>
    set((s) => {
      const next = { ...s.overrides, [actionId]: override };
      saveOverrides(next);
      return { overrides: next };
    }),
  resetHotkey: (actionId) =>
    set((s) => {
      const { [actionId]: _, ...rest } = s.overrides;
      saveOverrides(rest);
      return { overrides: rest };
    }),
  resetAll: () => {
    saveOverrides({});
    set({ overrides: {} });
  },
}));

export function getBinding(action: HotkeyAction, overrides: Record<string, HotkeyOverride>): { key?: string; code?: string; repeat?: boolean } {
  const override = overrides[action.id];
  if (override) return { ...override, repeat: action.repeat };
  return { key: action.defaultKey, code: action.defaultCode, repeat: action.repeat };
}

export function formatBinding(action: HotkeyAction, overrides: Record<string, HotkeyOverride>): string {
  const b = getBinding(action, overrides);
  if (b.code) return CODE_LABELS[b.code] ?? b.code;
  if (b.key) return KEY_LABELS[b.key] ?? b.key.toUpperCase();
  return '未绑定';
}

const CODE_LABELS: Record<string, string> = {
  Space: '空格',
  Backspace: '退格',
  Delete: '删除',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Tab: 'Tab',
  Escape: 'Esc',
};

const KEY_LABELS: Record<string, string> = {
  Enter: '回车',
  ' ': '空格',
};

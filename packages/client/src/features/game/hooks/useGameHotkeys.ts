import { useEffect, useRef } from 'react';
import { HOTKEY_ACTIONS, getBinding, useHotkeyStore } from '../stores/hotkey-store';

type HandlerMap = Record<string, () => void>;

function isInputFocused(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
}

export function useGameHotkeys(handlers: HandlerMap): void {
  const overrides = useHotkeyStore((s) => s.overrides);
  const ref = useRef({ handlers, overrides });
  ref.current = { handlers, overrides };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused(e)) return;
      const { handlers: h, overrides: o } = ref.current;
      for (const action of HOTKEY_ACTIONS) {
        if (!h[action.id]) continue;
        const b = getBinding(action, o);
        if (b.code && e.code !== b.code) continue;
        if (b.key && e.key.toLowerCase() !== b.key.toLowerCase()) continue;
        if (!b.code && !b.key) continue;
        if (!b.repeat && e.repeat) continue;
        e.preventDefault();
        h[action.id]();
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

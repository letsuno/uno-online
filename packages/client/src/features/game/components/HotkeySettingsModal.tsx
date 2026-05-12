import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw } from 'lucide-react';
import { HOTKEY_ACTIONS, formatBinding, useHotkeyStore } from '../stores/hotkey-store';
import type { HotkeyOverride } from '../stores/hotkey-store';

interface Props {
  open: boolean;
  onClose: () => void;
}

const IGNORED_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

export default function HotkeySettingsModal({ open, onClose }: Props) {
  const { overrides, setHotkey, resetHotkey, resetAll } = useHotkeyStore();
  const [listening, setListening] = useState<string | null>(null);
  const listenerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    if (!listening) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (IGNORED_KEYS.has(e.key)) return;

      if (e.key === 'Escape') {
        setListening(null);
        return;
      }

      const override: HotkeyOverride = e.key.length === 1
        ? { key: e.key.toLowerCase() }
        : { code: e.code };

      setHotkey(listening, override);
      setListening(null);
    };

    listenerRef.current = handler;
    window.addEventListener('keydown', handler, true);
    return () => {
      window.removeEventListener('keydown', handler, true);
      listenerRef.current = null;
    };
  }, [listening, setHotkey]);

  useEffect(() => {
    if (!open) setListening(null);
  }, [open]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-card rounded-panel-ui shadow-card border border-white/10 w-full max-w-sm mx-4"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h3 className="text-sm font-bold text-foreground">快捷键设置</h3>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <X size={16} />
            </button>
          </div>

          <div className="px-5 py-3 space-y-1">
            {HOTKEY_ACTIONS.map((action) => {
              const isListening = listening === action.id;
              const hasOverride = action.id in overrides;
              return (
                <div key={action.id} className="flex items-center justify-between py-2">
                  <span className="text-sm text-foreground">{action.label}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setListening(isListening ? null : action.id)}
                      className={`min-w-[72px] px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border ${
                        isListening
                          ? 'bg-accent/20 border-accent text-accent animate-pulse'
                          : 'bg-white/5 border-white/15 text-foreground hover:bg-white/10'
                      }`}
                    >
                      {isListening ? '按下按键…' : formatBinding(action, overrides)}
                    </button>
                    {hasOverride && (
                      <button
                        onClick={() => resetHotkey(action.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        title="恢复默认"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-5 py-3 border-t border-white/10 flex justify-between items-center">
            <button
              onClick={resetAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              全部恢复默认
            </button>
            <span className="text-2xs text-muted-foreground/50">按 Esc 取消录入</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

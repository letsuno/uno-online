import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { changelog } from '../data/changelog';

const STORAGE_KEY = 'app-last-seen-version';

let externalOpen: (() => void) | null = null;
export function openChangelog() { externalOpen?.(); }

export default function ChangelogModal() {
  const [open, setOpen] = useState(false);

  const show = useCallback(() => setOpen(true), []);
  useEffect(() => { externalOpen = show; return () => { externalOpen = null; }; }, [show]);

  useEffect(() => {
    const currentVersion = import.meta.env.BUILD_VERSION as string;
    const lastSeen = localStorage.getItem(STORAGE_KEY);
    if (lastSeen !== currentVersion) {
      setOpen(true);
    }
  }, []);

  const close = () => {
    setOpen(false);
    localStorage.setItem(STORAGE_KEY, import.meta.env.BUILD_VERSION as string);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-modal flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 glass-modal-backdrop"
            onClick={close}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-[420px] glass-panel"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <div className="flex items-center gap-2 text-lg font-bold">
                <Sparkles size={18} className="text-accent" /> 更新日志
              </div>
              <button onClick={close} className="p-1 text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[400px] overflow-y-auto p-5 scrollbar-thin">
              {changelog.map((entry) => (
                <div key={entry.version} className="mb-5 last:mb-0">
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="text-base font-bold text-accent">v{entry.version}</span>
                    <span className="text-xs text-muted-foreground">{entry.date}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {entry.changes.map((change, i) => (
                      <li key={i} className="flex gap-2 text-sm text-foreground/90">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="border-t border-white/5 px-5 py-3.5">
              <button
                onClick={close}
                className="w-full rounded-lg bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] px-4 py-2 text-sm font-bold text-[#1a1a2e] transition-colors hover:opacity-90"
              >
                知道了
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

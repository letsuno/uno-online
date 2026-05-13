import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useConfirmStore } from '../stores/confirm-store';
import { cn } from '../lib/utils';

/**
 * Top-level mount for in-app confirm/alert dialogs. Reads from `confirm-store`
 * and renders at most one dialog at a time. Keyboard: Enter confirms, Esc
 * cancels (alerts treat both as confirm).
 */
export default function ConfirmDialog() {
  const current = useConfirmStore((s) => s.current);
  const resolve = useConfirmStore((s) => s.resolve);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolve(current.type === 'alert');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resolve(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, resolve]);

  return (
    <AnimatePresence>
      {current && (
        <div className="fixed inset-0 z-modal flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 glass-modal-backdrop"
            onClick={() => resolve(current.type === 'alert')}
          />

          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-[420px] glass-panel"
          >
            <div className="flex items-start gap-3 px-6 pt-5">
              {current.variant === 'danger' && (
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-destructive" />
              )}
              <div className="flex-1">
                <h3 className="text-base font-bold text-foreground">{current.title}</h3>
                {current.message && (
                  <p className="mt-2 text-sm text-foreground/80 whitespace-pre-line">
                    {current.message}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3.5">
              {current.type === 'confirm' && (
                <button
                  onClick={() => resolve(false)}
                  className="rounded-lg bg-white/[0.06] px-4 py-2 text-sm font-semibold text-foreground/80 transition-colors hover:bg-white/[0.10]"
                >
                  {current.cancelText}
                </button>
              )}
              <button
                onClick={() => resolve(true)}
                autoFocus
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-bold transition-colors',
                  current.variant === 'danger'
                    ? 'bg-destructive/90 text-white hover:bg-destructive'
                    : 'bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] text-[#1a1a2e] hover:opacity-90',
                )}
              >
                {current.confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

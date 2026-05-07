import { AnimatePresence, motion } from 'framer-motion';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { useToastStore } from '../stores/toast-store';
import { cn } from '@/shared/lib/utils';

const ICON = { info: Info, error: AlertCircle, success: CheckCircle } as const;

const BG_CLASS = {
  info: 'bg-toast-info',
  error: 'bg-toast-error',
  success: 'bg-toast-success',
} as const;

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-toast flex flex-col gap-2 items-center pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICON[t.type];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className={cn(
                BG_CLASS[t.type],
                'text-white px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium shadow-toast pointer-events-auto max-w-toast-max'
              )}
            >
              <Icon size={16} />
              <span>{t.message}</span>
              <button onClick={() => removeToast(t.id)} className="bg-transparent border-none text-white cursor-pointer p-0 flex">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

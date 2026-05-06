import { AnimatePresence, motion } from 'framer-motion';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { useToastStore } from '../stores/toast-store';

const ICON = { info: Info, error: AlertCircle, success: CheckCircle } as const;
const BG = { info: 'rgba(59,130,246,0.9)', error: 'rgba(239,68,68,0.9)', success: 'rgba(34,197,94,0.9)' } as const;

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
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
              style={{
                background: BG[t.type], color: '#fff', padding: '10px 16px', borderRadius: 12,
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'auto', maxWidth: 360,
              }}
            >
              <Icon size={16} />
              <span>{t.message}</span>
              <button onClick={() => removeToast(t.id)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

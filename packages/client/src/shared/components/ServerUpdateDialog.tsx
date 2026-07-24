import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useServerVersionStore } from '../stores/server-version-store';

export default function ServerUpdateDialog() {
  const needsRefresh = useServerVersionStore((s) => s.needsRefresh);

  const handleRefresh = () => window.location.reload();

  return (
    <AnimatePresence>
      {needsRefresh && (
        <div className="fixed inset-0 z-modal flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 glass-modal-backdrop"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-[380px] glass-panel"
          >
            <div className="flex items-center gap-2 border-b border-white/5 px-6 py-4 text-lg font-bold">
              <RefreshCw size={18} className="text-accent" /> 检测到新版本
            </div>

            <div className="px-6 py-5">
              <p className="text-sm text-foreground/90">
                检测到版本更新，请刷新页面以加载最新版本。
              </p>
            </div>

            <div className="border-t border-white/5 px-5 py-3.5">
              <button
                onClick={handleRefresh}
                className="w-full gold-button-base px-4 py-2 text-sm"
              >
                刷新页面
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

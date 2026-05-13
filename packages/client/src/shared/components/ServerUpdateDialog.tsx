import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useServerVersionStore } from '../stores/server-version-store';

export default function ServerUpdateDialog() {
  const needsRefresh = useServerVersionStore((s) => s.needsRefresh);

  if (!needsRefresh) return null;

  const handleRefresh = () => window.location.reload();

  return (
    <AnimatePresence>
      {needsRefresh && (
        <div className="fixed inset-0 z-modal flex items-center justify-center">
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
              <RefreshCw size={18} className="text-accent" /> 服务器已更新
            </div>

            <div className="px-6 py-5">
              <p className="text-sm text-foreground/90">
                服务器刚刚完成了一次更新，请刷新页面以加载最新版本。
              </p>
            </div>

            <div className="border-t border-white/5 px-5 py-3.5">
              <button
                onClick={handleRefresh}
                className="w-full rounded-lg bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] px-4 py-2 text-sm font-bold text-[#1a1a2e] transition-colors hover:opacity-90"
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

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';

export default function NotificationPermissionDialog() {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    const current = Notification.permission;
    setPermission(current);
    if (current !== 'granted') {
      setOpen(true);
    }
  }, []);

  const handleRequest = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      setOpen(false);
    }
  };

  const close = () => setOpen(false);

  if (!open || permission === 'unsupported') return null;

  const isDenied = permission === 'denied';

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
            className="relative w-full max-w-[380px] glass-panel"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <div className="flex items-center gap-2 text-lg font-bold">
                <Bell size={18} className="text-accent" /> 开启通知
              </div>
              <button onClick={close} className="p-1 text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-foreground/90">
                开启浏览器通知后，当你不在游戏页面时，我们会在以下情况提醒你：
              </p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  游戏开始
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  轮到你出牌
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  游戏结束
                </li>
              </ul>

              {isDenied ? (
                <p className="text-xs text-destructive/80 mt-2">
                  通知权限已被拒绝，请在浏览器地址栏左侧的网站设置中手动开启通知权限。
                </p>
              ) : null}
            </div>

            <div className="border-t border-white/5 px-5 py-3.5">
              {isDenied ? (
                <button
                  onClick={close}
                  className="w-full rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-white/15"
                >
                  我知道了
                </button>
              ) : (
                <button
                  onClick={handleRequest}
                  className="w-full rounded-lg bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] px-4 py-2 text-sm font-bold text-[#1a1a2e] transition-colors hover:opacity-90"
                >
                  允许通知
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

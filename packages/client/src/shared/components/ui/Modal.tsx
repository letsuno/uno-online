import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { IconButton } from './IconButton';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** 底部操作区（按钮行） */
  footer?: ReactNode;
  /** 面板宽度（逻辑 px），默认 420 */
  width?: number;
  children: ReactNode;
  className?: string;
}

/**
 * 统一弹窗骨架：毛玻璃背景 + glass-panel + 头部/可滚内容/底部三段。
 * 内容超出视口高度时内部滚动，保证任何分辨率下完整可达。
 */
export default function Modal({ open, onClose, title, footer, width = 420, children, className }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 glass-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.div
            className={cn('glass-panel relative flex flex-col w-full max-h-[calc(100vh-2rem)]', className)}
            style={{ maxWidth: width }}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 26 } }}
            // 退出用快速 tween：spring 退出期间隐形遮罩会滞留 ~1s 拦截点击
            exit={{ scale: 0.95, opacity: 0, transition: { duration: 0.15 } }}
          >
            {title !== undefined && (
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
                <div className="text-base font-black text-foreground flex items-center gap-2 min-w-0">{title}</div>
                <IconButton size="sm" onClick={onClose} title="关闭">
                  <X size={15} />
                </IconButton>
              </div>
            )}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">{children}</div>
            {footer && <div className="border-t border-white/5 px-5 py-3.5 shrink-0">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

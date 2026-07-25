import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-modal">
          <motion.div
            className="absolute inset-0 glass-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute bottom-0 left-0 right-0 max-h-sheet-max-h glass-panel-sm !rounded-b-none !rounded-t-2xl flex flex-col overflow-hidden"
            initial={{ y: '100%' }}
            animate={{ y: 0, transition: { type: 'spring', damping: 30, stiffness: 300 } }}
            exit={{ y: '100%', transition: { duration: 0.18 } }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 100) {
                onClose();
              }
            }}
          >
            <div className="w-10 h-1 rounded-full bg-white/30 mx-auto mt-2 mb-1" />
            <div className="px-4 py-2 text-sm font-bold border-b border-white/5">
              {title}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

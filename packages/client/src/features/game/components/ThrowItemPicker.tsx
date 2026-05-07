import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

const ITEMS = [
  { emoji: '🥚', label: '鸡蛋' },
  { emoji: '🍅', label: '番茄' },
  { emoji: '🌹', label: '玫瑰' },
  { emoji: '💩', label: '便便' },
  { emoji: '👍', label: '点赞' },
  { emoji: '💖', label: '爱心' },
];

interface ThrowItemPickerProps {
  onSelect: (item: string) => void;
  onClose: () => void;
  anchorX: number;
  anchorY: number;
}

export default function ThrowItemPicker({ onSelect, onClose, anchorX, anchorY }: ThrowItemPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(onClose, 5000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onClose]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const handleSelect = (item: string) => {
    onSelect(item);
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        className="fixed z-modal pointer-events-auto"
        style={{ left: anchorX, top: anchorY, transform: 'translate(-50%, -100%)' }}
        initial={{ opacity: 0, scale: 0.7, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.7, y: 6 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <div className="bg-card/90 backdrop-blur-sm rounded-xl border border-white/10 p-2.5 flex gap-2 mb-2">
          {ITEMS.map(({ emoji, label }) => (
            <button
              key={emoji}
              onClick={() => handleSelect(emoji)}
              className="flex flex-col items-center gap-0.5 bg-transparent cursor-pointer transition-transform duration-150 hover:scale-125"
            >
              <span className="text-2xl">{emoji}</span>
              <span className="text-2xs text-muted-foreground">{label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

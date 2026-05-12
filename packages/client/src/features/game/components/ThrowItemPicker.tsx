import { useEffect, useRef, useCallback } from 'react';
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

const REPEAT_INTERVAL_MS = 300;
const MAX_HOLD_MS = 10_000;

interface ThrowItemPickerProps {
  onSelect: (item: string) => void;
  onClose: () => void;
  anchorX: number;
  anchorY: number;
}

export default function ThrowItemPicker({ onSelect, onClose, anchorX, anchorY }: ThrowItemPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const maxTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const stopRepeat = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = undefined; }
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = undefined; }
  }, []);

  useEffect(() => {
    timerRef.current = setTimeout(onClose, 15_000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      stopRepeat();
    };
  }, [onClose, stopRepeat]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const lastSendRef = useRef(0);

  const throttledSelect = useCallback((item: string) => {
    const now = Date.now();
    if (now - lastSendRef.current < REPEAT_INTERVAL_MS) return;
    lastSendRef.current = now;
    onSelect(item);
  }, [onSelect]);

  const startRepeat = useCallback((item: string) => {
    stopRepeat();
    throttledSelect(item);
    intervalRef.current = setInterval(() => throttledSelect(item), REPEAT_INTERVAL_MS);
    maxTimerRef.current = setTimeout(stopRepeat, MAX_HOLD_MS);
  }, [throttledSelect, stopRepeat]);

  useEffect(() => {
    const handleUp = () => stopRepeat();
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [stopRepeat]);

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
              onPointerDown={(e) => { e.preventDefault(); startRepeat(emoji); }}
              className="flex flex-col items-center gap-0.5 bg-transparent cursor-pointer transition-transform duration-150 hover:scale-125 select-none touch-none"
            >
              <span className="text-2xl">{emoji}</span>
              <span className="text-2xs text-muted-foreground">{label}</span>
            </button>
          ))}
        </div>
        <p className="text-center text-2xs text-muted-foreground/50 mb-1">长按连发</p>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

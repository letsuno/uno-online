import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const EMOJIS = ['👍', '😂', '😭', '🎉', '💪', '😱'];

interface QuickReactionProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function QuickReaction({ onSelect, onClose }: QuickReactionProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(onClose, 3000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onClose]);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        className="absolute bottom-full left-1/2 mb-10 z-fab"
        style={{ transform: 'translateX(-50%)' }}
        initial={{ opacity: 0, scale: 0.7, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.7, y: 6 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <div className="bg-card/90 backdrop-blur-sm rounded-xl border border-white/10 p-2 flex gap-1">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleSelect(emoji)}
              className="text-lg p-1 bg-transparent rounded-lg transition-transform duration-150 hover:scale-110 cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

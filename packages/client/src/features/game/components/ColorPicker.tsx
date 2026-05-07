import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Color } from '@uno-online/shared';

const COLORS: { color: Color; bgClass: string; label: string }[] = [
  { color: 'red', bgClass: 'bg-uno-red', label: '红' },
  { color: 'blue', bgClass: 'bg-uno-blue', label: '蓝' },
  { color: 'green', bgClass: 'bg-uno-green', label: '绿' },
  { color: 'yellow', bgClass: 'bg-uno-yellow', label: '黄' },
];

const BG_MAP: Record<Color, string> = {
  red: '#ff3366', blue: '#4488ff', green: '#33cc66', yellow: '#fbbf24',
};

interface ColorPickerProps { onPick: (color: Color) => void; }

export default function ColorPicker({ onPick }: ColorPickerProps) {
  const [picked, setPicked] = useState<Color | null>(null);

  const handlePick = (color: Color) => {
    setPicked(color);
    setTimeout(() => onPick(color), 400);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-modal">
      <AnimatePresence>
        {picked && (
          <motion.div
            key="burst"
            initial={{ scale: 0, opacity: 0.8, borderRadius: '50%' }}
            animate={{ scale: 30, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute w-color-burst h-color-burst rounded-full pointer-events-none"
            style={{ background: BG_MAP[picked] }}
          />
        )}
      </AnimatePresence>
      {!picked && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="bg-card rounded-panel px-8 py-6 flex flex-col items-center gap-4"
        >
          <h3 className="font-game text-accent">选择颜色</h3>
          <div className="flex gap-3">
            {COLORS.map(({ color, bgClass, label }) => (
              <motion.button
                key={color}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handlePick(color)}
                className={`${bgClass} w-15 h-15 rounded-full border-3 border-white text-lg font-bold text-white cursor-pointer shadow-card font-game`}
              >{label}</motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

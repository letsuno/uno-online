import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Color } from '@uno-online/shared';

const COLORS: { color: Color; bg: string; label: string }[] = [
  { color: 'red', bg: 'var(--color-red)', label: '红' },
  { color: 'blue', bg: 'var(--color-blue)', label: '蓝' },
  { color: 'green', bg: 'var(--color-green)', label: '绿' },
  { color: 'yellow', bg: 'var(--color-yellow)', label: '黄' },
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <AnimatePresence>
        {picked && (
          <motion.div
            key="burst"
            initial={{ scale: 0, opacity: 0.8, borderRadius: '50%' }}
            animate={{ scale: 30, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              position: 'absolute', width: 60, height: 60,
              background: BG_MAP[picked], borderRadius: '50%',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>
      {!picked && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          style={{ background: 'var(--bg-secondary)', borderRadius: 20, padding: '24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}
        >
          <h3 style={{ fontFamily: 'var(--font-game)', color: 'var(--text-accent)' }}>选择颜色</h3>
          <div style={{ display: 'flex', gap: 12 }}>
            {COLORS.map(({ color, bg, label }) => (
              <motion.button
                key={color}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handlePick(color)}
                style={{
                  width: 60, height: 60, borderRadius: '50%', background: bg, border: '3px solid white',
                  fontSize: 18, fontWeight: 'bold', color: 'white', cursor: 'pointer',
                  boxShadow: 'var(--card-shadow)', fontFamily: 'var(--font-game)',
                }}
              >{label}</motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

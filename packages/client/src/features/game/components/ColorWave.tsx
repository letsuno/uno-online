import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../stores/game-store';
import type { Color } from '@uno-online/shared';

const COLOR_MAP: Record<Color, string> = {
  red: '#ff3366',
  blue: '#4488ff',
  green: '#33cc66',
  yellow: '#fbbf24',
};

interface WaveState {
  id: number;
  color: string;
}

let waveId = 0;

export default function ColorWave() {
  const currentColor = useGameStore((s) => s.currentColor);
  const phase = useGameStore((s) => s.phase);
  const lastAction = useGameStore((s) => s.lastAction);
  const [wave, setWave] = useState<WaveState | null>(null);
  const prevColorRef = useRef<Color | null>(null);

  useEffect(() => {
    if (!currentColor || !lastAction) return;
    if (lastAction.type !== 'CHOOSE_COLOR' && lastAction.type !== 'PLAY_CARD') return;
    if (phase === 'round_end' || phase === 'game_over') return;

    const prevColor = prevColorRef.current;
    prevColorRef.current = currentColor;
    if (prevColor === currentColor) return;

    const hex = COLOR_MAP[currentColor];
    if (!hex) return;

    const id = ++waveId;
    setWave({ id, color: hex });
    const timer = setTimeout(() => setWave(null), 1200);
    return () => clearTimeout(timer);
  }, [currentColor, lastAction, phase]);

  return (
    <AnimatePresence>
      {wave && (
        <motion.div
          key={wave.id}
          className="fixed inset-0 pointer-events-none z-effects"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute rounded-full"
            style={{
              left: '50%',
              top: '50%',
              width: 40,
              height: 40,
              marginLeft: -20,
              marginTop: -20,
              background: `radial-gradient(circle, ${wave.color}44 0%, ${wave.color}00 70%)`,
              boxShadow: `0 0 60px 20px ${wave.color}55`,
            }}
            initial={{ scale: 0, opacity: 0.9 }}
            animate={{ scale: 60, opacity: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute rounded-full"
            style={{
              left: '50%',
              top: '50%',
              width: 8,
              height: 8,
              marginLeft: -4,
              marginTop: -4,
              border: `2px solid ${wave.color}`,
            }}
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 200, opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

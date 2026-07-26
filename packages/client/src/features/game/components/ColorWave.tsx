import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../stores/game-store';
import type { Color } from '@uno-online/shared';
import { UNO_COLOR_HEX } from '../constants/colors';

interface WaveState {
  id: number;
  color: string;
  /** 涟漪终态直径：盖住视口对角线即可，再大都是白烧栅格化 */
  size: number;
}

export default function ColorWave() {
  const currentColor = useGameStore((s) => s.currentColor);
  const phase = useGameStore((s) => s.phase);
  const lastAction = useGameStore((s) => s.lastAction);
  const [wave, setWave] = useState<WaveState | null>(null);
  const prevColorRef = useRef<Color | null>(null);
  const waveIdRef = useRef(0);

  useEffect(() => {
    if (!currentColor || !lastAction) return;
    if (lastAction.type !== 'CHOOSE_COLOR' && lastAction.type !== 'PLAY_CARD') return;
    if (phase === 'round_end' || phase === 'game_over') return;

    const prevColor = prevColorRef.current;
    prevColorRef.current = currentColor;
    if (prevColor === currentColor) return;

    const hex = UNO_COLOR_HEX[currentColor];
    if (!hex) return;

    const id = ++waveIdRef.current;
    const size = Math.ceil(Math.hypot(window.innerWidth, window.innerHeight));
    setWave({ id, color: hex, size });
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
          {/* 关键：两层都按「最终尺寸」布局，再从 scale 0 放大到 1。
              旧写法是 8px/40px 的小元素放大到 scale 200/60 —— 浏览器会随着 scale 增长
              反复以更高分辨率重新栅格化这个巨型图层（实测占整个渲染进程 CPU 的 ~40%）。
              按终态尺寸布局后只栅格化一次，之后纯合成器缩放。 */}
          <motion.div
            className="absolute rounded-full will-change-transform" data-allow-overflow
            style={{
              left: '50%',
              top: '50%',
              width: wave.size,
              height: wave.size,
              marginLeft: -wave.size / 2,
              marginTop: -wave.size / 2,
              background: `radial-gradient(circle, ${wave.color}44 0%, ${wave.color}00 70%)`,
            }}
            initial={{ scale: 0, opacity: 0.9 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute rounded-full will-change-transform" data-allow-overflow
            style={{
              left: '50%',
              top: '50%',
              width: wave.size,
              height: wave.size,
              marginLeft: -wave.size / 2,
              marginTop: -wave.size / 2,
              // 旧写法 2px 边框被放大 200 倍 ≈ 400 视觉像素，这里按比例直接给到终态
              border: `${Math.round(wave.size * 0.25)}px solid ${wave.color}`,
            }}
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

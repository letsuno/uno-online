import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';

const ROTATING_ITEMS = new Set(['🥚', '🍅']);

interface ThrowAnimationProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  item: string;
  onComplete: () => void;
}

function getParticleColors(item: string): string[] {
  switch (item) {
    case '🥚': return ['#fff9c4', '#fff176', '#f9e08a'];
    case '🍅': return ['#ef4444', '#f87171', '#dc2626'];
    case '🌹': return ['#ec4899', '#f472b6', '#be185d'];
    case '💩': return ['#92400e', '#a16207', '#78350f'];
    case '👍': return ['#fbbf24', '#f59e0b', '#d97706'];
    case '💖': return ['#ec4899', '#f472b6', '#f9a8d4'];
    default: return ['#fbbf24', '#f59e0b', '#d97706'];
  }
}

export default function ThrowAnimation({ from, to, item, onComplete }: ThrowAnimationProps) {
  const [phase, setPhase] = useState<'flying' | 'impact' | 'done'>('flying');
  const controls = useAnimationControls();
  const shouldRotate = ROTATING_ITEMS.has(item);

  const controlPoint = useMemo(() => ({
    x: (from.x + to.x) / 2,
    y: Math.min(from.y, to.y) - Math.abs(to.x - from.x) * 0.4,
  }), [from, to]);

  // Compute Bezier keyframes
  const { xKeyframes, yKeyframes } = useMemo(() => {
    const steps = 20;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      xs.push((1 - t) ** 2 * from.x + 2 * (1 - t) * t * controlPoint.x + t ** 2 * to.x);
      ys.push((1 - t) ** 2 * from.y + 2 * (1 - t) * t * controlPoint.y + t ** 2 * to.y);
    }
    return { xKeyframes: xs, yKeyframes: ys };
  }, [from, to, controlPoint]);

  // Particles
  const particles = useMemo(() => {
    const colors = getParticleColors(item);
    return Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.5;
      const dist = 30 + Math.random() * 20;
      return {
        id: i,
        color: colors[i % colors.length],
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
      };
    });
  }, [item]);

  const startFlight = useCallback(async () => {
    await controls.start({
      x: xKeyframes,
      y: yKeyframes,
      rotate: shouldRotate ? 360 : 0,
      transition: { duration: 0.6, ease: 'easeInOut' },
    });
    setPhase('impact');
  }, [controls, xKeyframes, yKeyframes, shouldRotate]);

  useEffect(() => {
    startFlight();
  }, [startFlight]);

  useEffect(() => {
    if (phase === 'impact') {
      const timer = setTimeout(() => {
        setPhase('done');
        onComplete();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [phase, onComplete]);

  return (
    <div className="fixed inset-0 pointer-events-none z-effects">
      <AnimatePresence>
        {phase === 'flying' && (
          <motion.div
            className="absolute text-effect"
            style={{ left: 0, top: 0 }}
            initial={{ x: from.x, y: from.y, scale: 1 }}
            animate={controls}
          >
            {item}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'impact' && (
          <>
            {/* Scale pulse at destination */}
            <motion.div
              className="absolute text-effect"
              style={{ left: to.x, top: to.y, transform: 'translate(-50%, -50%)' }}
              initial={{ scale: 1, opacity: 1 }}
              animate={{ scale: [1, 1.3, 0], opacity: [1, 1, 0] }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              {item}
            </motion.div>

            {/* Particles */}
            {particles.map((p) => (
              <motion.div
                key={p.id}
                className="absolute rounded-full"
                style={{
                  left: to.x,
                  top: to.y,
                  width: 6,
                  height: 6,
                  backgroundColor: p.color,
                }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: p.dx,
                  y: p.dy,
                  opacity: 0,
                  scale: 0,
                }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            ))}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const COLORS = ['#ff3366', '#4488ff', '#33cc66', '#fbbf24', '#a855f7', '#ec4899'];

interface Particle {
  id: number;
  x: number;
  color: string;
  delay: number;
  size: number;
  isCircle: boolean;
}

export default function Confetti() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const items: Particle[] = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      delay: Math.random() * 0.5,
      size: 6 + Math.random() * 8,
      isCircle: Math.random() > 0.5,
    }));
    setParticles(items);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-confetti overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -20, x: `${p.x}vw`, opacity: 1, rotate: 0 }}
          animate={{ y: '110vh', rotate: 720, opacity: 0 }}
          transition={{ duration: 2.5 + Math.random(), delay: p.delay, ease: 'linear' }}
          className="absolute"
          style={{
            width: p.size,
            height: p.size,
            borderRadius: p.isCircle ? '50%' : '2px',
            background: p.color,
          }}
        />
      ))}
    </div>
  );
}

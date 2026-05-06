import { motion } from 'framer-motion';
import { useGameStore } from '../stores/game-store';

export default function DirectionIndicator() {
  const direction = useGameStore((s) => s.direction);
  const isClockwise = direction === 'clockwise';

  return (
    <motion.div
      className="absolute w-[120px] h-[120px] md:w-40 md:h-40 border-2 border-dashed border-primary/50 rounded-full flex items-center justify-center"
      animate={{ rotate: isClockwise ? 0 : 180 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    >
      <motion.span
        className="text-[28px] text-primary/70"
        key={direction}
        initial={{ scale: 1.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
      >
        {isClockwise ? '↻' : '↺'}
      </motion.span>
    </motion.div>
  );
}

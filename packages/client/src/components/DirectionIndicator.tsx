import { motion } from 'framer-motion';
import { useGameStore } from '../stores/game-store';
import '../styles/game.css';

export default function DirectionIndicator() {
  const direction = useGameStore((s) => s.direction);
  const isClockwise = direction === 'clockwise';

  return (
    <motion.div
      className="direction-ring"
      animate={{ rotate: isClockwise ? 0 : 180 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    >
      <motion.span
        className="direction-ring__arrow"
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

import { memo } from 'react';
import { motion } from 'framer-motion';
import CardBack from './CardBack';

export interface ActiveHandSwap {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  count: number;
}

interface HandSwapAnimationProps {
  swap: ActiveHandSwap;
  onComplete: () => void;
}

function HandSwapAnimation({ swap, onComplete }: HandSwapAnimationProps) {
  const visibleCards = Math.min(5, swap.count);

  return (
    <motion.div
      className="absolute pointer-events-none z-effects flex items-center"
      style={{ left: 0, top: 0 }}
      initial={{ x: swap.from.x, y: swap.from.y, opacity: 0, scale: 0.88 }}
      animate={{ x: swap.to.x, y: swap.to.y, opacity: [0, 1, 1, 0], scale: [0.88, 1, 1, 0.92] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.82, ease: 'easeInOut' }}
      onAnimationComplete={onComplete}
    >
      <div className="flex -space-x-2 -translate-x-1/2 -translate-y-1/2">
        {Array.from({ length: visibleCards }).map((_, i) => (
          <CardBack key={i} small />
        ))}
      </div>
      {swap.count > 5 && (
        <span className="-translate-y-1/2 ml-1 rounded bg-black/60 px-1.5 py-0.5 text-2xs font-bold text-foreground tabular-nums">
          ×{swap.count}
        </span>
      )}
    </motion.div>
  );
}

export default memo(HandSwapAnimation);

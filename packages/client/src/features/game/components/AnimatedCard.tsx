import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import type { Card as CardType } from '@uno-online/shared';
import Card from './Card';
import { cn } from '@/shared/lib/utils';

interface AnimatedCardProps {
  card: CardType;
  playable?: boolean;
  clickable?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  layoutId?: string;
  className?: string;
}

const AnimatedCard = forwardRef<HTMLDivElement, AnimatedCardProps>(
  function AnimatedCard({ card, playable, clickable = playable, dimmed, onClick, style, layoutId, className }, ref) {
    return (
      <motion.div
        ref={ref}
        layoutId={layoutId}
        className={cn('inline-block', className)}
        initial={{ scale: 0.8, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.5, opacity: 0, y: -40, rotate: 15 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        whileHover={clickable ? { y: -24, scale: 1.1, zIndex: 50, transition: { type: 'tween', duration: 0.15 } } : undefined}
        whileTap={clickable ? { scale: 0.95 } : undefined}
        style={style}
      >
        <Card card={card} playable={playable} clickable={clickable} dimmed={dimmed} onClick={onClick} />
      </motion.div>
    );
  },
);

export default AnimatedCard;

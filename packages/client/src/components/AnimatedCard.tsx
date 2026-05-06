import { motion } from 'framer-motion';
import type { Card as CardType } from '@uno-online/shared';
import Card from './Card';
import { cn } from '@/lib/utils';

interface AnimatedCardProps {
  card: CardType;
  playable?: boolean;
  clickable?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  layoutId?: string;
  className?: string;
}

export default function AnimatedCard({ card, playable, clickable = playable, onClick, style, layoutId, className }: AnimatedCardProps) {
  return (
    <motion.div
      layoutId={layoutId}
      className={cn('inline-block', className)}
      initial={{ scale: 0.8, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.5, opacity: 0, y: -40, rotate: 15 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      whileHover={clickable ? { y: -24, scale: 1.1, zIndex: 10 } : undefined}
      whileTap={clickable ? { scale: 0.95 } : undefined}
      style={style}
    >
      <Card card={card} playable={playable} clickable={clickable} onClick={onClick} />
    </motion.div>
  );
}

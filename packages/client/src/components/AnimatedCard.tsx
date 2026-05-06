import { motion } from 'framer-motion';
import type { Card as CardType } from '@uno-online/shared';
import Card from './Card.js';

interface AnimatedCardProps {
  card: CardType;
  playable?: boolean;
  clickable?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  layoutId?: string;
}

export default function AnimatedCard({ card, playable, clickable = playable, dimmed, onClick, style, layoutId }: AnimatedCardProps) {
  return (
    <motion.div
      layoutId={layoutId}
      initial={{ scale: 0.8, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.5, opacity: 0, y: -40, rotate: 15 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      whileHover={clickable ? { y: -16, scale: 1.08, zIndex: 50 } : undefined}
      whileTap={clickable ? { scale: 0.95 } : undefined}
      style={{ display: 'inline-block', ...style }}
    >
      <Card card={card} playable={playable} clickable={clickable} dimmed={dimmed} onClick={onClick} />
    </motion.div>
  );
}

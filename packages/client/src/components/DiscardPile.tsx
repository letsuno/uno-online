import { motion, AnimatePresence } from 'framer-motion';
import Card from './Card';
import { useGameStore } from '../stores/game-store';

export default function DiscardPile() {
  const discardPile = useGameStore((s) => s.discardPile);
  const drawStack = useGameStore((s) => s.drawStack);
  const topCard = discardPile[discardPile.length - 1];
  if (!topCard) return null;

  return (
    <div className="flex flex-col items-center gap-1.5 z-card relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={topCard.id}
          initial={{ scale: 1.5, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 3, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <Card card={topCard} />
        </motion.div>
      </AnimatePresence>
      {drawStack > 0 && (
        <motion.div
          key={`stack-${drawStack}`}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute -top-3 -right-3 bg-destructive text-white rounded-full w-8 h-8 flex items-center justify-center font-black text-sm font-game border-2 border-white shadow-card-sm"
        >
          +{drawStack}
        </motion.div>
      )}
      <span className="text-xs text-muted-foreground">弃牌堆</span>
    </div>
  );
}

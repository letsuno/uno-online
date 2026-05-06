import { motion, AnimatePresence } from 'framer-motion';
import Card from './Card';
import { useGameStore } from '../stores/game-store';

export default function DiscardPile() {
  const discardPile = useGameStore((s) => s.discardPile);
  const drawStack = useGameStore((s) => s.drawStack);
  const topCard = discardPile[discardPile.length - 1];
  if (!topCard) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1, position: 'relative' }}>
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
          style={{
            position: 'absolute', top: -12, right: -12,
            background: 'var(--color-red)', color: '#fff',
            borderRadius: '50%', width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 14, fontFamily: 'var(--font-game)',
            border: '2px solid #fff',
            boxShadow: '2px 3px 0px rgba(0,0,0,0.3)',
          }}
        >
          +{drawStack}
        </motion.div>
      )}
      <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>弃牌堆</span>
    </div>
  );
}

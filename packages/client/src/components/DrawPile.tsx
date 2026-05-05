import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardBack from './CardBack.js';
import Card from './Card.js';
import { useGameStore } from '../stores/game-store.js';

interface DrawPileProps { onDraw: () => void; }

export default function DrawPile({ onDraw }: DrawPileProps) {
  const deckCount = useGameStore((s) => s.deckCount);
  const lastDrawnCard = useGameStore((s) => s.lastDrawnCard);
  const [flipping, setFlipping] = useState(false);
  const [flipCard, setFlipCard] = useState(lastDrawnCard);

  useEffect(() => {
    if (lastDrawnCard) {
      setFlipCard(lastDrawnCard);
      setFlipping(true);
      const timer = setTimeout(() => setFlipping(false), 800);
      return () => clearTimeout(timer);
    }
  }, [lastDrawnCard?.id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1, position: 'relative' }}>
      <CardBack onClick={onDraw} style={{ cursor: 'pointer' }} />
      <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>牌堆 ({deckCount})</span>
      <AnimatePresence>
        {flipping && flipCard && (
          <motion.div
            key={flipCard.id}
            initial={{ rotateY: 180, scale: 0.8, y: 0, opacity: 1 }}
            animate={{ rotateY: 0, scale: 1, y: 60, opacity: 1 }}
            exit={{ scale: 0.5, y: 120, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              position: 'absolute', top: 0, left: '50%', marginLeft: -35,
              perspective: 600, transformStyle: 'preserve-3d',
              zIndex: 5, pointerEvents: 'none',
            }}
          >
            <Card card={flipCard} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

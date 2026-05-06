import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardBack from './CardBack.js';
import Card from './Card.js';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';

interface DrawPileProps { onDraw: () => void; }

export default function DrawPile({ onDraw }: DrawPileProps) {
  const deckCount = useGameStore((s) => s.deckCount);
  const lastDrawnCard = useGameStore((s) => s.lastDrawnCard);
  const phase = useGameStore((s) => s.phase);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const authUserId = useAuthStore((s) => s.user?.id);
  const viewerId = useGameStore((s) => s.viewerId);
  const userId = viewerId ?? authUserId;
  const [flipping, setFlipping] = useState(false);
  const [flipCard, setFlipCard] = useState(lastDrawnCard);

  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const canDraw = isMyTurn && !hasDrawnThisTurn && phase === 'playing';

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
      <CardBack
        onClick={canDraw ? onDraw : undefined}
        style={{
          cursor: canDraw ? 'pointer' : 'default',
          opacity: canDraw ? 1 : 0.5,
          transition: 'opacity 0.2s, transform 0.2s',
        }}
      />
      <span style={{ fontSize: 10, color: deckCount <= 10 ? 'var(--color-red)' : 'var(--text-secondary)', fontWeight: deckCount <= 10 ? 'bold' : 'normal' }}>
        牌堆 ({deckCount})
      </span>
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

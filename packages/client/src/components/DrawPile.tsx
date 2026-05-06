import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardBack from './CardBack.js';
import Card from './Card.js';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import { getPlayableCardIds } from '../utils/playable-cards.js';

interface DrawPileProps { onDraw: () => void; }

export default function DrawPile({ onDraw }: DrawPileProps) {
  const deckCount = useGameStore((s) => s.deckCount);
  const lastDrawnCard = useGameStore((s) => s.lastDrawnCard);
  const phase = useGameStore((s) => s.phase);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const discardPile = useGameStore((s) => s.discardPile);
  const currentColor = useGameStore((s) => s.currentColor);
  const drawStack = useGameStore((s) => s.drawStack);
  const settings = useGameStore((s) => s.settings);
  const authUserId = useAuthStore((s) => s.user?.id);
  const viewerId = useGameStore((s) => s.viewerId);
  const userId = viewerId ?? authUserId;
  const [flipping, setFlipping] = useState(false);
  const [flipCard, setFlipCard] = useState(lastDrawnCard);

  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const canDraw = isMyTurn && !hasDrawnThisTurn && phase === 'playing';
  const me = players.find((p) => p.id === userId);
  const topCard = discardPile[discardPile.length - 1];

  const playableIds = useMemo(() => {
    if (!isMyTurn || phase !== 'playing') return new Set<string>();
    return getPlayableCardIds({
      hand: me?.hand ?? [],
      topCard,
      currentColor,
      drawStack,
      houseRules: settings?.houseRules,
    });
  }, [currentColor, drawStack, isMyTurn, me?.hand, phase, settings?.houseRules, topCard]);

  const showNoPlayableHint = canDraw && playableIds.size === 0 && !settings?.houseRules?.noHints;
  const emphasizeDraw = canDraw && !settings?.houseRules?.noHints;

  useEffect(() => {
    if (lastDrawnCard) {
      setFlipCard(lastDrawnCard);
      setFlipping(true);
      const timer = setTimeout(() => setFlipping(false), 800);
      return () => clearTimeout(timer);
    }
  }, [lastDrawnCard?.id]);

  return (
    <div className="draw-pile">
      <AnimatePresence>
        {showNoPlayableHint && (
          <motion.div
            className="draw-pile__hint"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            无牌可出，摸牌
          </motion.div>
        )}
      </AnimatePresence>
      <CardBack
        onClick={canDraw ? onDraw : undefined}
        className={emphasizeDraw ? 'card-back--draw-ready' : undefined}
        style={{
          cursor: canDraw ? 'pointer' : 'default',
          opacity: canDraw ? 1 : 0.5,
        }}
      />
      <span className={deckCount <= 10 ? 'draw-pile__count draw-pile__count--low' : 'draw-pile__count'}>
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

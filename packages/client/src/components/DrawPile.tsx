import { useMemo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardBack from './CardBack.js';
import DrawCardAnimation from './DrawCardAnimation.js';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import { getPlayableCardIds } from '../utils/playable-cards.js';

interface DrawPileProps { onDraw: () => void; }

export default function DrawPile({ onDraw }: DrawPileProps) {
  const deckCount = useGameStore((s) => s.deckCount);
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

  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const canDraw = isMyTurn && !hasDrawnThisTurn && phase === 'playing';

  // Trigger draw animation whenever deckCount decreases (= someone drew a card)
  const [drawAnimTrigger, setDrawAnimTrigger] = useState(0);
  const prevDeckCountRef = useRef(deckCount);
  useEffect(() => {
    if (prevDeckCountRef.current > 0 && deckCount < prevDeckCountRef.current) {
      setDrawAnimTrigger((n) => n + 1);
    }
    prevDeckCountRef.current = deckCount;
  }, [deckCount]);
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

  return (
    <div className="draw-pile" style={{ position: 'relative' }}>
      <DrawCardAnimation trigger={drawAnimTrigger} />
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
    </div>
  );
}

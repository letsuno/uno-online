import { useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import AnimatedCard from './AnimatedCard.js';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import { getPlayableCardIds } from '../utils/playable-cards.js';
import '../styles/game.css';

interface PlayerHandProps {
  onPlayCard: (cardId: string) => void;
}

export default function PlayerHand({ onPlayCard }: PlayerHandProps) {
  const authUserId = useAuthStore((s) => s.user?.id);
  const viewerId = useGameStore((s) => s.viewerId);
  const userId = viewerId ?? authUserId;
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const discardPile = useGameStore((s) => s.discardPile);
  const currentColor = useGameStore((s) => s.currentColor);
  const phase = useGameStore((s) => s.phase);
  const settings = useGameStore((s) => s.settings);
  const drawStack = useGameStore((s) => s.drawStack);

  const me = players.find((p) => p.id === userId);
  const isMyTurn = players[currentPlayerIndex]?.id === userId;
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
  const hintedIds = settings?.houseRules?.noHints ? new Set<string>() : playableIds;

  if (!me) return null;

  return (
    <div className="player-hand">
      <div className="player-hand__cards">
        <AnimatePresence mode="popLayout">
          {me.hand.map((card, i) => {
            const angle = (i - (me.hand.length - 1) / 2) * 4;
            return (
              <AnimatedCard
                key={card.id}
                layoutId={card.id}
                card={card}
                playable={hintedIds.has(card.id)}
                clickable={playableIds.has(card.id)}
                onClick={() => playableIds.has(card.id) && onPlayCard(card.id)}
                style={{ transform: `rotate(${angle}deg)` }}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

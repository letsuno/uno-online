import { useMemo } from 'react';
import type { Card as CardType } from '@uno-online/shared';
import { getPlayableCards } from '@uno-online/shared';
import { AnimatePresence } from 'framer-motion';
import AnimatedCard from './AnimatedCard.js';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import '../styles/game.css';

interface PlayerHandProps {
  onPlayCard: (cardId: string) => void;
}

export default function PlayerHand({ onPlayCard }: PlayerHandProps) {
  const userId = useAuthStore((s) => s.user?.id);
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const discardPile = useGameStore((s) => s.discardPile);
  const currentColor = useGameStore((s) => s.currentColor);
  const phase = useGameStore((s) => s.phase);
  const settings = useGameStore((s) => s.settings);

  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);

  const me = players.find((p) => p.id === userId);
  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const topCard = discardPile[discardPile.length - 1];

  const playableIds = useMemo(() => {
    if (settings?.houseRules?.noHints) return new Set<string>();
    if (!isMyTurn || !topCard || !currentColor || phase !== 'playing') return new Set<string>();
    const playable = getPlayableCards(me?.hand ?? [], topCard, currentColor);
    return new Set(playable.map((c) => c.id));
  }, [me?.hand, topCard, currentColor, isMyTurn, phase, settings]);

  const showNoPlayableHint = isMyTurn && phase === 'playing' && playableIds.size === 0 && !hasDrawnThisTurn && !settings?.houseRules?.noHints;

  if (!me) return null;

  return (
    <div className="player-hand">
      {showNoPlayableHint && (
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
          无牌可出，请摸牌
        </div>
      )}
      <div className="player-hand__cards">
        <AnimatePresence mode="popLayout">
          {me.hand.map((card, i) => {
            const angle = (i - (me.hand.length - 1) / 2) * 4;
            return (
              <AnimatedCard
                key={card.id}
                layoutId={card.id}
                card={card}
                playable={playableIds.has(card.id)}
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

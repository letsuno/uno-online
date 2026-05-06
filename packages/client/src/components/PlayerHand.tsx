import { useMemo } from 'react';
import type { Card as CardType, HouseRules } from '@uno-online/shared';
import { getPlayableCards } from '@uno-online/shared';
import { AnimatePresence } from 'framer-motion';
import AnimatedCard from './AnimatedCard.js';
import { useGameStore } from '../stores/game-store.js';
import { useAuthStore } from '../stores/auth-store.js';
import '../styles/game.css';

interface PlayerHandProps {
  onPlayCard: (cardId: string) => void;
}

function canRespondToDrawStack(card: CardType, topCard: CardType, houseRules?: HouseRules): boolean {
  if (!houseRules) return false;

  const canStack =
    (houseRules.stackDrawTwo && card.type === 'draw_two' && topCard.type === 'draw_two') ||
    (houseRules.stackDrawFour && card.type === 'wild_draw_four' && topCard.type === 'wild_draw_four') ||
    (
      houseRules.crossStack &&
      (
        (card.type === 'draw_two' && topCard.type === 'wild_draw_four') ||
        (card.type === 'wild_draw_four' && topCard.type === 'draw_two')
      )
    );
  const canDeflect =
    (houseRules.reverseDeflectDrawTwo && card.type === 'reverse' && topCard.type === 'draw_two') ||
    (houseRules.reverseDeflectDrawFour && card.type === 'reverse' && topCard.type === 'wild_draw_four') ||
    (houseRules.skipDeflect && card.type === 'skip');

  return canStack || canDeflect;
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

  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);

  const me = players.find((p) => p.id === userId);
  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const topCard = discardPile[discardPile.length - 1];

  const playableIds = useMemo(() => {
    if (!isMyTurn || !topCard || !currentColor || phase !== 'playing') return new Set<string>();
    const playable = drawStack > 0
      ? (me?.hand ?? []).filter((card) => canRespondToDrawStack(card, topCard, settings?.houseRules))
      : getPlayableCards(me?.hand ?? [], topCard, currentColor);
    return new Set(playable.map((c) => c.id));
  }, [me?.hand, topCard, currentColor, isMyTurn, phase, settings, drawStack]);
  const hintedIds = settings?.houseRules?.noHints ? new Set<string>() : playableIds;

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

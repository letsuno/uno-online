import { useMemo } from 'react';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from './useEffectiveUserId';
import { useIsMyTurn } from './useIsMyTurn';
import { getPlayableCardIds } from '@/shared/utils/playable-cards';

export function usePlayableCardIds(): Set<string> {
  const userId = useEffectiveUserId();
  const players = useGameStore((s) => s.players);
  const discardPile = useGameStore((s) => s.discardPile);
  const currentColor = useGameStore((s) => s.currentColor);
  const drawStack = useGameStore((s) => s.drawStack);
  const pendingPenaltyDraws = useGameStore((s) => s.pendingPenaltyDraws);
  const settings = useGameStore((s) => s.settings);
  const phase = useGameStore((s) => s.phase);
  const isMyTurn = useIsMyTurn();

  const me = players.find((p) => p.id === userId);
  const topCard = discardPile[discardPile.length - 1];

  return useMemo(() => {
    if (!isMyTurn || phase !== 'playing') return new Set<string>();
    if (pendingPenaltyDraws > 0) return new Set<string>();
    return getPlayableCardIds({
      hand: me?.hand ?? [],
      topCard,
      currentColor,
      drawStack,
      houseRules: settings?.houseRules,
    });
  }, [currentColor, drawStack, isMyTurn, me?.hand, pendingPenaltyDraws, phase, settings?.houseRules, topCard]);
}

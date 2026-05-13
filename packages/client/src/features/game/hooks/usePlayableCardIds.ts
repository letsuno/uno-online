import { useMemo } from 'react';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from './useEffectiveUserId';
import { useIsMyTurn } from './useIsMyTurn';
import { getPlayableCardIds, getJumpInCardIds } from '@/shared/utils/playable-cards';
import { canRespondToDrawStack } from '@uno-online/shared';

export function usePlayableCardIds(): Set<string> {
  const userId = useEffectiveUserId();
  const myHand = useGameStore((s) => s.players.find((p) => p.id === userId)?.hand);
  const topCard = useGameStore((s) => s.discardPile[s.discardPile.length - 1]);
  const currentColor = useGameStore((s) => s.currentColor);
  const drawStack = useGameStore((s) => s.drawStack);
  const pendingPenaltyDraws = useGameStore((s) => s.pendingPenaltyDraws);
  const pendingDrawPlayerId = useGameStore((s) => s.pendingDrawPlayerId);
  const settings = useGameStore((s) => s.settings);
  const phase = useGameStore((s) => s.phase);
  const isMyTurn = useIsMyTurn();

  return useMemo(() => {
    if (phase === 'challenging' && pendingDrawPlayerId === userId && topCard) {
      const hr = settings?.houseRules;
      const ids = (myHand ?? []).filter(c => canRespondToDrawStack(c, topCard, hr)).map(c => c.id);
      return new Set(ids);
    }
    if (phase !== 'playing') return new Set<string>();
    if (!isMyTurn) {
      if (!settings?.houseRules?.jumpIn) return new Set<string>();
      if (pendingPenaltyDraws > 0 || drawStack > 0) return new Set<string>();
      return getJumpInCardIds(myHand ?? [], topCard);
    }
    if (pendingPenaltyDraws > 0) return new Set<string>();
    return getPlayableCardIds({
      hand: myHand ?? [],
      topCard,
      currentColor,
      drawStack,
      houseRules: settings?.houseRules,
    });
  }, [currentColor, drawStack, isMyTurn, myHand, pendingPenaltyDraws, phase, settings?.houseRules, topCard]);
}

import { useEffect, useState } from 'react';
import type { Card as CardType } from '@uno-online/shared';
import { useGameStore } from '../stores/game-store';

export interface LastPlayed {
  card: CardType;
  time: number;
}

/**
 * 每个玩家最近打出的牌（5 秒后自动清除）。
 * 桌面 GameTable（PlayerNode 迷你牌）与移动端 OpponentRow 共用。
 */
export function useLastPlayedCards(): {
  lastPlayedCards: Map<string, LastPlayed>;
  clearLastPlayed: (playerId: string) => void;
} {
  const lastAction = useGameStore(s => s.lastAction);
  const [lastPlayedCards, setLastPlayedCards] = useState<Map<string, LastPlayed>>(new Map());

  useEffect(() => {
    if (lastAction?.type !== 'PLAY_CARD' || !lastAction.playerId) return;
    const topCard = useGameStore.getState().discardPile.at(-1);
    if (!topCard) return;

    setLastPlayedCards(prev => {
      const next = new Map(prev);
      next.set(lastAction.playerId, { card: topCard, time: Date.now() });
      return next;
    });

    const playerId = lastAction.playerId;
    const timer = window.setTimeout(() => {
      setLastPlayedCards(prev => {
        const next = new Map(prev);
        next.delete(playerId);
        return next;
      });
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [lastAction]);

  const clearLastPlayed = (playerId: string) => {
    setLastPlayedCards(prev => {
      if (!prev.has(playerId)) return prev;
      const next = new Map(prev);
      next.delete(playerId);
      return next;
    });
  };

  return { lastPlayedCards, clearLastPlayed };
}

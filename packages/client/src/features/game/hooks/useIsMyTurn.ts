import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from './useEffectiveUserId';

export function useIsMyTurn(): boolean {
  const userId = useEffectiveUserId();
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);

  return players[currentPlayerIndex]?.id === userId;
}

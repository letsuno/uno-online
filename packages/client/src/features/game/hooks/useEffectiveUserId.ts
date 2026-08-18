import { useGameStore } from '../stores/game-store';

export function useEffectiveUserId(): string | undefined {
  // PlayerView is the sole game-identity source. Spectators deliberately use
  // the synthetic "__spectator__" viewer id rather than their auth user id.
  return useGameStore(state => state.viewerId ?? undefined);
}

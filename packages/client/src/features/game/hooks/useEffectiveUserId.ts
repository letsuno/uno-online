import { useGameStore } from '../stores/game-store';
import { useAuthStore } from '@/features/auth/stores/auth-store';

export function useEffectiveUserId(): string | undefined {
  const viewerId = useGameStore((s) => s.viewerId);
  const authUserId = useAuthStore((s) => s.user?.id);
  return viewerId ?? authUserId;
}

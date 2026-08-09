import { useCallback } from 'react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { useSpectatorStore } from '../stores/spectator-store';

export function useSpectatorQueue() {
  const userId = useAuthStore(state => state.user?.id ?? null);
  const queue = useSpectatorStore(state => state.pendingJoinQueue);
  const queued = userId !== null && queue.some(entry => entry.userId === userId);

  const toggle = useCallback(() => {
    getSocket().emit('game:spectator_join', result => {
      if (!result.success) {
        useToastStore.getState().addToast(result.error, 'error');
      }
    });
  }, []);

  return { queue, queued, toggle };
}

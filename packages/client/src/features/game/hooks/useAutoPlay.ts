import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/shared/stores/settings-store';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from './useEffectiveUserId';
import { getSocket } from '@/shared/socket';

export function useAutoPlay(): void {
  const autoPlay = useSettingsStore((s) => s.autoPlay);
  const players = useGameStore((s) => s.players);
  const userId = useEffectiveUserId();
  const prevAutoPlay = useRef(autoPlay);

  const me = players.find((p) => p.id === userId);

  useEffect(() => {
    if (!me) return;
    if (autoPlay !== prevAutoPlay.current) {
      prevAutoPlay.current = autoPlay;
      if (autoPlay !== me.autopilot) {
        getSocket().emit('player:toggle-autopilot', () => {});
      }
    }
  }, [autoPlay, me]);
}

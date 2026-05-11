import { useCallback } from 'react';
import type { Color } from '@uno-online/shared';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';

export function useGameActions() {
  const playCard = useCallback((cardId: string, chosenColor?: Color) => {
    getSocket().emit('game:play_card', chosenColor ? { cardId, chosenColor } : { cardId }, () => {});
  }, []);

  const drawCard = useCallback((side: 'left' | 'right') => {
    getSocket().emit('game:draw_card', { side }, () => {});
  }, []);

  const chooseColor = useCallback((color: Color) => {
    getSocket().emit('game:choose_color', { color }, () => {});
  }, []);

  const callUno = useCallback(() => {
    getSocket().emit('game:call_uno', () => {});
  }, []);

  const catchUno = useCallback((targetId: string) => {
    getSocket().emit('game:catch_uno', { targetPlayerId: targetId }, () => {});
  }, []);

  const challenge = useCallback(() => {
    getSocket().emit('game:challenge', () => {});
  }, []);

  const accept = useCallback(() => {
    getSocket().emit('game:accept', () => {});
  }, []);

  const pass = useCallback(() => {
    getSocket().emit('game:pass', () => {});
  }, []);

  const swapTarget = useCallback((targetId: string) => {
    getSocket().emit('game:choose_swap_target', { targetId }, () => {});
  }, []);

  const playAgain = useCallback(() => {
    getSocket().emit('game:next_round', (res: { success?: boolean; started?: boolean; error?: string; vote?: { votes: number; required: number } }) => {
      if (!res?.success) {
        useToastStore.getState().addToast(res?.error || '无法开始下一轮', 'error');
        return;
      }
      if (res.started) return;
      if (res.vote) {
        const ready = res.vote.votes >= res.vote.required;
        useToastStore.getState().addToast(
          ready ? '所有玩家已同意，等待房主开始' : `已同意 (${res.vote.votes}/${res.vote.required})`,
          'info',
        );
      }
    });
  }, []);

  const rematch = useCallback(() => {
    getSocket().emit('game:rematch', (res: { success?: boolean; error?: string }) => {
      if (res && !res.success) {
        useToastStore.getState().addToast(res.error || '无法发起再来一局', 'error');
      }
    });
  }, []);

  const kickPlayer = useCallback((targetId: string) => {
    getSocket().emit('game:kick_player', { targetId }, (res: { success?: boolean; error?: string }) => {
      if (!res?.success) {
        useToastStore.getState().addToast(res?.error || '踢出失败', 'error');
      }
    });
  }, []);

  return {
    playCard,
    drawCard,
    chooseColor,
    callUno,
    catchUno,
    challenge,
    accept,
    pass,
    swapTarget,
    playAgain,
    rematch,
    kickPlayer,
  };
}

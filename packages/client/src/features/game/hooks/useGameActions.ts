import { useCallback } from 'react';
import type { Color } from '@uno-online/shared';
import { getSocket } from '@/shared/socket';
import { playSound } from '@/shared/sound/sound-manager';
import { useToastStore } from '@/shared/stores/toast-store';

export function useGameActions() {
  const playCard = useCallback((cardId: string, chosenColor?: Color) => {
    playSound('play_card');
    getSocket().emit('game:play_card', chosenColor ? { cardId, chosenColor } : { cardId }, () => {});
  }, []);

  const drawCard = useCallback(() => {
    playSound('draw_card');
    getSocket().emit('game:draw_card', () => {});
  }, []);

  const chooseColor = useCallback((color: Color) => {
    getSocket().emit('game:choose_color', { color }, () => {});
  }, []);

  const callUno = useCallback(() => {
    playSound('uno_call');
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
        useToastStore.getState().addToast(`已投票 (${res.vote.votes}/${res.vote.required})`, 'info');
      }
    });
  }, []);

  const rematch = useCallback(() => {
    getSocket().emit('game:rematch', () => {});
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
  };
}

import { useCallback } from 'react';
import type { Color } from '@uno-online/shared';
import { useGameStore } from '../stores/game-store';
import { getSocket } from '@/shared/socket';
import { playSound } from '@/shared/sound/sound-manager';

export function useGameActions() {
  const drawStack = useGameStore((s) => s.drawStack);
  const settings = useGameStore((s) => s.settings);

  const playCard = useCallback((cardId: string) => {
    playSound('play_card');
    getSocket().emit('game:play_card', { cardId }, () => {});
  }, []);

  const drawCard = useCallback(() => {
    const houseRules = settings?.houseRules;
    const shouldAutoPass =
      drawStack === 0 &&
      !houseRules?.drawUntilPlayable &&
      !houseRules?.deathDraw &&
      !houseRules?.forcedPlayAfterDraw;

    playSound('draw_card');
    getSocket().emit('game:draw_card', (res: { success: boolean }) => {
      if (res?.success && shouldAutoPass) {
        getSocket().emit('game:pass', () => {});
      }
    });
  }, [drawStack, settings?.houseRules]);

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
    getSocket().emit('game:next_round', () => {});
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

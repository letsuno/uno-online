import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Color } from '@uno-online/shared';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { useGameStore } from '../stores/game-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { useSpectatorStore } from '../stores/spectator-store';
import { reportSocketError } from '@/shared/report-socket-error';

export function useGameActions() {
  const navigate = useNavigate();
  const playCard = useCallback((cardId: string, chosenColor?: Color) => {
    getSocket().emit('game:play_card', chosenColor ? { cardId, chosenColor } : { cardId }, reportSocketError);
  }, []);

  const drawCard = useCallback((side: 'left' | 'right') => {
    getSocket().emit('game:draw_card', { side }, reportSocketError);
  }, []);

  const chooseColor = useCallback((color: Color) => {
    getSocket().emit('game:choose_color', { color }, reportSocketError);
  }, []);

  const callUno = useCallback(() => {
    getSocket().emit('game:call_uno', reportSocketError);
  }, []);

  const catchUno = useCallback((targetId: string) => {
    getSocket().emit('game:catch_uno', { targetPlayerId: targetId }, reportSocketError);
  }, []);

  const challenge = useCallback(() => {
    getSocket().emit('game:challenge', reportSocketError);
  }, []);

  const accept = useCallback(() => {
    getSocket().emit('game:accept', reportSocketError);
  }, []);

  const pass = useCallback(() => {
    getSocket().emit('game:pass', reportSocketError);
  }, []);

  const swapTarget = useCallback((targetId: string) => {
    getSocket().emit('game:choose_swap_target', { targetId }, reportSocketError);
  }, []);

  const playAgain = useCallback(() => {
    getSocket().emit('game:next_round', res => {
      if (!res.success) {
        useToastStore.getState().addToast(res.error, 'error');
        return;
      }
      if (res.started) return;
      const ready = res.vote.votes >= res.vote.required;
      useToastStore
        .getState()
        .addToast(ready ? '所有玩家已同意，等待房主开始' : `已同意 (${res.vote.votes}/${res.vote.required})`, 'info');
    });
  }, []);

  const backToRoom = useCallback(() => {
    getSocket().emit('game:back_to_room', res => {
      if (!res.success) {
        useToastStore.getState().addToast(res.error, 'error');
        return;
      }
      const roomCode = useRoomStore.getState().roomCode;
      if (!roomCode) return;
      useRoomStore.getState().setRoom(roomCode, res.seats, res.spectators, res.room);
      // The ACK carries the committed waiting-room snapshot. Apply it even if
      // the room broadcast projection failed, so the owner cannot remain on a
      // dead game-over scoreboard after a successful transition.
      useGameStore.getState().clearGame();
      useSpectatorStore.getState().clearSpectators();
      navigate(`/room/${roomCode}`, { replace: true });
    });
  }, [navigate]);

  const kickPlayer = useCallback((targetId: string) => {
    getSocket().emit('game:kick_player', { targetId }, res => {
      if (!res.success) {
        useToastStore.getState().addToast(res.error, 'error');
      }
    });
  }, []);

  const leaveToSpectate = useCallback(() => {
    getSocket().emit('game:leave_to_spectate', res => {
      if (res.success) {
        useGameStore.getState().setSpectator(true);
      } else {
        useToastStore.getState().addToast(res.error, 'error');
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
    backToRoom,
    kickPlayer,
    leaveToSpectate,
  };
}

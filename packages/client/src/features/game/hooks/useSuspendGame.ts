import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, isCurrentSocket } from '@/shared/socket';
import { leaveVoiceSession } from '@/shared/voice/voice-runtime';
import { resetClientRoomState } from '@/shared/stores/reset-room';
import { getCurrentSuspendedRoomScope, markRoomSuspended } from '@/shared/stores/suspended-room-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { useToastStore } from '@/shared/stores/toast-store';

/**
 * Leave the game screen without deleting an active player's membership.
 * The server turns a player into disconnected + autopilot immediately; a
 * spectator still performs a normal room leave.
 */
export function useSuspendGame() {
  const navigate = useNavigate();
  const cancelInFlight = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cancelInFlight.current?.();
    },
    [],
  );

  return () => {
    if (cancelInFlight.current) return;
    const roomCode = useRoomStore.getState().roomCode;
    const socket = getSocket();
    const scope = getCurrentSuspendedRoomScope();
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const release = () => {
      cancelInFlight.current = null;
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      release();
    };
    cancelInFlight.current = cancel;
    const stillOwnsGeneration = () => {
      const currentScope = getCurrentSuspendedRoomScope();
      return (
        isCurrentSocket(socket) &&
        useRoomStore.getState().roomCode === roomCode &&
        currentScope.userId === scope.userId &&
        currentScope.serverId === scope.serverId
      );
    };
    const finishLocalLeave = (suspended: boolean, disconnect: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      release();
      // A route/auth/server transition may already have established another
      // membership while this ACK was in flight. Never let the old operation
      // disconnect or clear that newer generation.
      if (!stillOwnsGeneration()) return;
      socket.emit('voice:presence', { inVoice: false, micEnabled: false, speakerMuted: false, speaking: false });
      if (disconnect) socket.disconnect();
      leaveVoiceSession();
      resetClientRoomState();
      if (suspended && roomCode) markRoomSuspended(roomCode);
      navigate('/');
    };
    timeout = setTimeout(() => {
      // The request may have committed while only its ACK was lost. Honor the
      // user's leave intent and close the transport: if it did not commit,
      // the server's disconnect path still preserves the hand and eventually
      // enables autopilot instead of deleting the player.
      finishLocalLeave(true, true);
    }, 2_000);

    socket.emit('room:leave', res => {
      if (settled) return;
      if (!res.success) {
        settled = true;
        clearTimeout(timeout);
        release();
        useToastStore.getState().addToast(res.error, 'error');
        return;
      }
      // A suspended socket should not remain in a stale adapter room if the
      // server's best-effort detach projection failed. The lobby reconnects a
      // clean transport that joins only its private user channel.
      // Even a normal spectator/waiting leave may have committed while the
      // adapter-room detach projection failed. Always retire the old
      // transport so a later room cannot receive broadcasts from both rooms.
      finishLocalLeave(res.outcome === 'suspended', true);
    });
  };
}

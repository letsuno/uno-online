import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, isCurrentSocket } from '@/shared/socket';
import { leaveVoiceSession } from '@/shared/voice/voice-runtime';
import { resetClientRoomState } from '@/shared/stores/reset-room';
import { useToastStore } from '@/shared/stores/toast-store';
import { getCurrentSuspendedRoomScope } from '@/shared/stores/suspended-room-store';
import { useRoomStore } from '@/shared/stores/room-store';

/**
 * Voluntarily leave a waiting room or spectator seat. The server ACK is the
 * normal membership boundary; an ACK timeout retires the transport and lets
 * the lobby's authoritative current-room query reconcile the ambiguous write.
 */
export function useLeaveRoom() {
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
    const socket = getSocket();
    const roomCode = useRoomStore.getState().roomCode;
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
    const finishLocalLeave = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      release();
      if (!stillOwnsGeneration()) return;
      socket.emit('voice:presence', {
        inVoice: false,
        micEnabled: false,
        speakerMuted: false,
        speaking: false,
      });
      // Durable membership removal and adapter-room detach are separate
      // commits. Retire this transport so a failed detach cannot leak old
      // room broadcasts into the next room joined by the same SPA.
      socket.disconnect();
      leaveVoiceSession();
      resetClientRoomState();
      navigate('/');
    };
    timeout = setTimeout(() => {
      // The leave may have committed while its ACK was lost. Closing the
      // transport is safe in either case; user:current_room corrects any
      // membership that still exists when the lobby reconnects.
      finishLocalLeave();
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
      finishLocalLeave();
    });
  };
}

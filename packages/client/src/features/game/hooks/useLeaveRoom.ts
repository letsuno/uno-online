import { useNavigate } from 'react-router-dom';
import { getSocket } from '@/shared/socket';
import { leaveVoiceSession } from '@/shared/voice/voice-runtime';
import { resetClientRoomState } from '@/shared/stores/reset-room';

/**
 * Returns a function that voluntarily leaves the current room: tears down the
 * local voice session, notifies the server (`room:leave`), clears all
 * room/game/spectator stores, and navigates to `/lobby`.
 *
 * Voice is torn down *before* awaiting the server ack so that the mic/speakers
 * release immediately even if the server callback never arrives (network drop).
 * `resetClientRoomState` calls `leaveVoiceSession` again inside the callback,
 * but that call is idempotent.
 */
export function useLeaveRoom() {
  const navigate = useNavigate();

  return () => {
    getSocket().emit('voice:presence', { inVoice: false, micEnabled: false, speakerMuted: false, speaking: false });
    leaveVoiceSession();
    getSocket().emit('room:leave', () => {
      resetClientRoomState();
      navigate('/lobby');
    });
  };
}

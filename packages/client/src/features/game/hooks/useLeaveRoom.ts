import { useNavigate } from 'react-router-dom';
import { getSocket } from '@/shared/socket';
import { resetClientRoomState } from '@/shared/stores/reset-room';

/**
 * Returns a function that voluntarily leaves the current room: notifies the
 * server (`room:leave`), clears all room/game/spectator stores, ends the voice
 * session, and navigates to `/lobby`.
 *
 * Voice presence is broadcast as offline before disconnecting so other clients
 * see the user drop out of voice immediately rather than waiting for the
 * server-side teardown.
 */
export function useLeaveRoom() {
  const navigate = useNavigate();

  return () => {
    getSocket().emit('voice:presence', { inVoice: false, micEnabled: false, speakerMuted: false, speaking: false });
    getSocket().emit('room:leave', () => {
      resetClientRoomState();
      navigate('/lobby');
    });
  };
}

import { useRoomStore } from './room-store';
import { useGameStore } from '@/features/game/stores/game-store';
import { useSpectatorStore } from '@/features/game/stores/spectator-store';
import { leaveVoiceSession } from '@/shared/voice/voice-runtime';

/**
 * Reset all client-side room/game/voice state. Use this on the boundary where
 * the user is no longer in any room — voluntary leave, kicked, room dissolved,
 * cheat detected, auth failure. Pure side effects, no navigation.
 */
export function resetClientRoomState(): void {
  useRoomStore.getState().clearRoom();
  useGameStore.getState().clearGame();
  useSpectatorStore.getState().clearSpectators();
  leaveVoiceSession();
}

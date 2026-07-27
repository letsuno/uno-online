import { useRoomStore } from './room-store';
import { useGameStore } from '@/features/game/stores/game-store';
import { useSpectatorStore } from '@/features/game/stores/spectator-store';
import { useChatStore } from '@/features/game/stores/chat-store';
import { useGameLogStore } from '@/features/game/stores/game-log-store';
import { leaveVoiceSession } from '@/shared/voice/voice-runtime';
import { clearRoomJoinRecord } from '@/shared/room-join-tracker';

/**
 * Reset all client-side room/game/voice state. Use this on the boundary where
 * the user is no longer in any room — voluntary leave, kicked, room dissolved,
 * cheat detected, auth failure. Pure side effects, no navigation.
 */
export function resetClientRoomState(): void {
  useRoomStore.getState().clearRoom();
  useGameStore.getState().clearGame();
  useSpectatorStore.getState().clearSpectators();
  // Chat/log are room-scoped too: the server only replays chat:history on
  // rejoin, so anything left here would leak verbatim into the next room's
  // panel (and silently diverge from the server's empty history).
  useChatStore.getState().clearMessages();
  useGameLogStore.getState().clear();
  clearRoomJoinRecord();
  leaveVoiceSession();
}

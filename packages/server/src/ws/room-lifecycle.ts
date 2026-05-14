import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import type { GameSession } from '../plugins/core/game/session.js';
import { deleteRoom } from '../plugins/core/room/store.js';
import type { TurnTimer } from '../plugins/core/game/turn-timer.js';
import type { GameStatePersister } from '../plugins/core/game/state-store.js';
import type { VoiceChannelManager } from '../voice/channel-manager.js';
import { clearRoomTimeouts } from './room-events.js';
import { clearPendingSpectatorJoins } from './game-events.js';
import { leaveRoomSocket } from './socket-room.js';
import { clearVoicePresence } from './voice-presence.js';
import { clearRoomSpectators } from '../plugins/core/spectate/ws.js';

export async function dissolveRoom(
  io: SocketIOServer,
  kv: KvStore,
  roomCode: string,
  sessions: Map<string, GameSession>,
  turnTimer: TurnTimer,
  persister: GameStatePersister,
  reason: 'host_closed' | 'idle_timeout' | 'empty' = 'host_closed',
  voiceChannels?: VoiceChannelManager,
): Promise<void> {
  turnTimer.stop(roomCode);
  clearRoomTimeouts(roomCode);
  clearPendingSpectatorJoins(roomCode);
  clearRoomSpectators(roomCode);
  persister.cleanup(roomCode);
  const session = sessions.get(roomCode);
  session?.clearChatHistory();
  sessions.delete(roomCode);
  io.to(roomCode).emit('chat:cleared');
  clearVoicePresence(io, roomCode);

  // host_closed = the owner explicitly chose to dissolve. Surface that with
  // the glitch overlay (reused from cheat detection) instead of the standard
  // "room dissolved" toast/navigate path, so it feels deliberate and dramatic.
  // Other reasons (idle_timeout, empty) keep the quieter notification.
  if (reason === 'host_closed') {
    io.to(roomCode).emit('game:cheat_detected');
  } else {
    io.to(roomCode).emit('room:dissolved', { reason });
  }

  const sockets = await io.in(roomCode).fetchSockets();
  await Promise.all(sockets.map((s) => leaveRoomSocket(kv, s, roomCode)));

  await Promise.all([
    voiceChannels?.deleteRoomChannel(roomCode),
    deleteRoom(kv, roomCode),
  ]);
}

import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import type { GameSession } from '../plugins/core/game/session.js';
import { deleteRoom, clearUserRoom } from '../plugins/core/room/store.js';
import type { TurnTimer } from '../plugins/core/game/turn-timer.js';
import type { GameStatePersister } from '../plugins/core/game/state-store.js';
import type { VoiceChannelManager } from '../voice/channel-manager.js';
import { clearRoomTimeouts } from './room-events.js';
import { clearPendingSpectatorJoins } from './game-events.js';
import type { SocketData } from './types.js';
import { clearVoicePresence } from './voice-presence.js';

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
  persister.cleanup(roomCode);
  const session = sessions.get(roomCode);
  session?.clearChatHistory();
  sessions.delete(roomCode);
  io.to(roomCode).emit('chat:cleared');
  clearVoicePresence(io, roomCode);
  io.to(roomCode).emit('room:dissolved', { reason });

  const sockets = await io.in(roomCode).fetchSockets();
  const pending: Promise<unknown>[] = [];
  for (const s of sockets) {
    const data = s.data as SocketData;
    pending.push(clearUserRoom(kv, data.user.userId));
    data.roomCode = null;
    data.isSpectator = false;
    pending.push(Promise.resolve(s.leave(roomCode)));
  }
  await Promise.all(pending);

  await Promise.all([
    voiceChannels?.deleteRoomChannel(roomCode),
    deleteRoom(kv, roomCode),
  ]);
}

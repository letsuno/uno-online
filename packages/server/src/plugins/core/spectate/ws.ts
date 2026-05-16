import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../../../kv/types.js';
import { getRoomSpectators } from '../room/store.js';
import { removePendingSpectatorJoin, getPendingSpectatorQueue } from '../../../ws/game-events.js';

export function toSpectatorView(spectators: import('../room/store.js').RoomSpectator[]) {
  return spectators.map(s => ({ nickname: s.nickname, avatarUrl: s.avatarUrl, connected: s.connected }));
}

export async function broadcastSpectatorList(io: SocketIOServer, kv: KvStore, roomCode: string): Promise<void> {
  const spectators = toSpectatorView(await getRoomSpectators(kv, roomCode));
  io.to(roomCode).emit('room:spectator_list', { spectators });
}

export async function broadcastSpectatorLeft(
  io: SocketIOServer,
  kv: KvStore,
  roomCode: string,
  userId: string,
  nickname: string,
): Promise<void> {
  if (removePendingSpectatorJoin(roomCode, userId)) {
    io.to(roomCode).emit('game:spectator_queue', {
      queue: getPendingSpectatorQueue(roomCode),
      nickname,
      joined: false,
    });
  }
  const spectators = toSpectatorView(await getRoomSpectators(kv, roomCode));
  io.to(roomCode).emit('room:spectator_list', { spectators });
  io.to(roomCode).emit('room:spectator_left', { nickname, spectators });
}


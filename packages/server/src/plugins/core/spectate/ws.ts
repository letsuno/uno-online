import type { UnoServer as SocketIOServer } from '../../../ws/types.js';
import type { KvStore } from '../../../kv/types.js';
import { getRoomSpectators } from '../room/store.js';

export function toSpectatorView(spectators: import('../room/store.js').RoomSpectator[]) {
  return spectators.map(s => ({
    userId: s.userId,
    nickname: s.nickname,
    avatarUrl: s.avatarUrl,
    connected: s.connected,
  }));
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
  const spectators = toSpectatorView(await getRoomSpectators(kv, roomCode));
  io.to(roomCode).emit('room:spectator_list', { spectators });
  io.to(roomCode).emit('room:spectator_left', { nickname, spectators });
}

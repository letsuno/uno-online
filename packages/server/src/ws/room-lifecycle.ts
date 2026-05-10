import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../kv/types';
import type { GameSession } from '../plugins/core/game/session';
import { deleteRoom } from '../plugins/core/room/store';
import type { TurnTimer } from '../plugins/core/game/turn-timer';
import type { SocketData } from './types';

export async function dissolveRoom(
  io: SocketIOServer,
  kv: KvStore,
  roomCode: string,
  sessions: Map<string, GameSession>,
  turnTimer: TurnTimer,
  reason: 'host_closed' | 'idle_timeout' | 'empty' = 'host_closed',
): Promise<void> {
  turnTimer.stop(roomCode);
  const session = sessions.get(roomCode);
  session?.clearChatHistory();
  sessions.delete(roomCode);
  io.to(roomCode).emit('chat:cleared');
  io.to(roomCode).emit('room:dissolved', { reason });

  const sockets = await io.in(roomCode).fetchSockets();
  for (const s of sockets) {
    const data = s.data as SocketData;
    data.roomCode = null;
    data.isSpectator = false;
    await s.leave(roomCode);
  }

  await deleteRoom(kv, roomCode);
}

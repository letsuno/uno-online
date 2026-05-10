import type { Server as SocketIOServer } from 'socket.io';
import type { Kysely } from 'kysely';
import type { KvStore } from '../kv/types';
import type { Database } from '../db/database';
import type { GameSession } from '../plugins/core/game/session';
import { deleteRoom } from '../plugins/core/room/store';
import type { TurnTimer } from '../plugins/core/game/turn-timer';
import { persistGameOnDissolve } from './game-events';
import type { SocketData } from './types';
import { clearVoicePresence } from './voice-presence';

export async function dissolveRoom(
  io: SocketIOServer,
  kv: KvStore,
  roomCode: string,
  sessions: Map<string, GameSession>,
  turnTimer: TurnTimer,
  reason: 'host_closed' | 'idle_timeout' | 'empty' = 'host_closed',
  db?: Kysely<Database>,
): Promise<void> {
  turnTimer.stop(roomCode);
  const session = sessions.get(roomCode);

  if (session && db) {
    const state = session.getFullState();
    if (state.players.length > 0 && state.roundNumber > 0) {
      await persistGameOnDissolve(roomCode, session, db);
    }
  }

  session?.clearChatHistory();
  sessions.delete(roomCode);
  io.to(roomCode).emit('chat:cleared');
  clearVoicePresence(io, roomCode);
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

import type { Server as SocketIOServer } from 'socket.io';
import type { Kysely } from 'kysely';
import type { KvStore } from '../kv/types.js';
import type { Database } from '../db/database.js';
import type { GameSession } from '../plugins/core/game/session.js';
import { deleteRoom } from '../plugins/core/room/store.js';
import type { TurnTimer } from '../plugins/core/game/turn-timer.js';
import type { GameStatePersister } from '../plugins/core/game/state-store.js';
import { persistGameOnDissolve } from './game-events.js';
import { clearRoomTimeouts } from './room-events.js';
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
  db?: Kysely<Database>,
): Promise<void> {
  turnTimer.stop(roomCode);
  clearRoomTimeouts(roomCode);
  persister.cleanup(roomCode);
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

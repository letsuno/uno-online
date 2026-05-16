import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../../../kv/types.js';
import type { SocketData } from '../../../ws/types.js';
import { deleteRoom, getRoom, clearUserRoom, ensureNotInRoom, getRoomSpectators, addSpectatorToRoom } from '../room/store.js';
import { GameSession } from '../game/session.js';
import { loadGameState } from '../game/state-store.js';
import { removePendingSpectatorJoin, getPendingSpectatorQueue } from '../../../ws/game-events.js';
import { joinRoomSocket } from '../../../ws/socket-room.js';

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

export function setupSpectateHandlers(
  io: SocketIOServer,
  kv: KvStore,
  sessions: Map<string, GameSession>,
): void {
  io.on('connection', (socket) => {
    socket.on('room:spectate', async (roomCode: string, callback?: (res: Record<string, unknown>) => void) => {
      const data = socket.data as SocketData;
      if (!data.user) {
        callback?.({ success: false, error: '未登录' });
        return;
      }

      const room = await getRoom(kv, roomCode);
      if (!room) {
        callback?.({ success: false, error: '房间不存在' });
        return;
      }
      if (room.status !== 'playing') {
        callback?.({ success: false, error: '游戏未开始' });
        return;
      }
      if (!room.settings.allowSpectators) {
        callback?.({ success: false, error: '该房间不允许观战' });
        return;
      }

      const conflict = await ensureNotInRoom(kv, data.user.userId, roomCode);
      if (conflict) {
        callback?.({ success: false, error: conflict });
        return;
      }

      let session = sessions.get(roomCode);
      if (!session) {
        const savedState = await loadGameState(kv, roomCode);
        if (!savedState) {
          await deleteRoom(kv, roomCode);
          callback?.({ success: false, error: '游戏会话不存在' });
          return;
        }
        session = GameSession.fromState(savedState);
        sessions.set(roomCode, session);
      }

      await joinRoomSocket(kv, socket, roomCode, { asSpectator: true });

      await addSpectatorToRoom(kv, roomCode, {
        userId: data.user.userId,
        nickname: data.user.nickname,
        avatarUrl: data.user.avatarUrl,
        role: data.user.role,
        connected: true,
      });

      const view = session.getSpectatorView(room.settings.spectatorMode);
      socket.emit('game:state', view);
      socket.emit('chat:history', session.getChatHistory());

      const spectators = toSpectatorView(await getRoomSpectators(kv, roomCode));
      io.to(roomCode).emit('room:spectator_list', { spectators });
      socket.to(roomCode).emit('room:spectator_joined', {
        nickname: data.user.nickname,
        spectators,
      });

      callback?.({ success: true });
    });

    // Spectator disconnect is handled by the unified disconnect handler in
    // socket-handler.ts — same timeout/reconnect flow as seated players.
  });
}

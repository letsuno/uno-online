import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../../../kv/types.js';
import type { SocketData } from '../../../ws/types.js';
import { deleteRoom, getRoom, clearUserRoom, ensureNotInRoom } from '../room/store.js';
import { GameSession } from '../game/session.js';
import { loadGameState } from '../game/state-store.js';
import { removePendingSpectatorJoin, getPendingSpectatorQueue } from '../../../ws/game-events.js';
import { joinRoomSocket } from '../../../ws/socket-room.js';

interface SpectatorInfo {
  nickname: string;
  avatarUrl?: string | null;
}

// Keyed by userId — nicknames aren't enforced unique at signup. Single
// socket per user is enforced at connection time, so no ref-counting.
const roomSpectators = new Map<string, Map<string, SpectatorInfo>>();

export function getSpectatorNames(roomCode: string): SpectatorInfo[] {
  return [...(roomSpectators.get(roomCode)?.values() ?? [])];
}

export function clearRoomSpectators(roomCode: string): void {
  roomSpectators.delete(roomCode);
}

/** Idempotent on `(roomCode, userId)`; refreshes the stored info. */
export function addSpectator(roomCode: string, userId: string, nickname: string, avatarUrl?: string | null): void {
  let room = roomSpectators.get(roomCode);
  if (!room) {
    room = new Map();
    roomSpectators.set(roomCode, room);
  }
  room.set(userId, { nickname, avatarUrl });
}

/** Returns the removed nickname, or `null` if the user wasn't tracked. */
export function removeSpectator(roomCode: string, userId: string): string | null {
  const room = roomSpectators.get(roomCode);
  if (!room) return null;
  const info = room.get(userId);
  if (info == null) return null;
  room.delete(userId);
  if (room.size === 0) roomSpectators.delete(roomCode);
  return info.nickname;
}

export function broadcastSpectatorList(io: SocketIOServer, roomCode: string): void {
  io.to(roomCode).emit('room:spectator_list', { spectators: getSpectatorNames(roomCode) });
}

/**
 * Drains the user from both the pending-join queue and the registry, then
 * broadcasts. Warns on untracked users — every caller's precondition
 * (`data.isSpectator === true`) implies they must be tracked.
 */
export function broadcastSpectatorLeft(
  io: SocketIOServer,
  roomCode: string,
  userId: string,
  nickname: string,
): void {
  if (removePendingSpectatorJoin(roomCode, userId)) {
    io.to(roomCode).emit('game:spectator_queue', {
      queue: getPendingSpectatorQueue(roomCode),
      nickname,
      joined: false,
    });
  }
  const removed = removeSpectator(roomCode, userId);
  if (removed == null) {
    console.warn('[spectate] broadcastSpectatorLeft called for untracked user', { roomCode, userId });
    return;
  }
  const spectators = getSpectatorNames(roomCode);
  io.to(roomCode).emit('room:spectator_list', { spectators });
  io.to(roomCode).emit('room:spectator_left', { nickname: removed, spectators });
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

      addSpectator(roomCode, data.user.userId, data.user.nickname, data.user.avatarUrl);

      const view = session.getSpectatorView(room.settings.spectatorMode);
      socket.emit('game:state', view);
      socket.emit('chat:history', session.getChatHistory());

      const spectators = getSpectatorNames(roomCode);
      io.to(roomCode).emit('room:spectator_list', { spectators });
      socket.to(roomCode).emit('room:spectator_joined', {
        nickname: data.user.nickname,
        spectators,
      });

      callback?.({ success: true });
    });

    socket.on('disconnect', () => {
      const data = socket.data as SocketData;
      if (!data.isSpectator || !data.roomCode || !data.user) return;
      const { userId, nickname } = data.user;
      broadcastSpectatorLeft(io, data.roomCode, userId, nickname);
      clearUserRoom(kv, userId).catch((err) => {
        console.warn('[spectate] clearUserRoom on disconnect failed:', err);
      });
    });
  });
}

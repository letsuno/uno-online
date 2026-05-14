import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../../../kv/types.js';
import type { SocketData } from '../../../ws/types.js';
import { deleteRoom, getRoom, clearUserRoom, ensureNotInRoom } from '../room/store.js';
import { GameSession } from '../game/session.js';
import { loadGameState } from '../game/state-store.js';
import { removePendingSpectatorJoin, getPendingSpectatorQueue } from '../../../ws/game-events.js';
import { joinRoomSocket } from '../../../ws/socket-room.js';

// Authoritative in-memory spectator registry. Keyed by userId (nicknames can
// change and aren't unique on the wire). Single socket per user is enforced
// at the connection layer (socket-handler.ts kicks the prior socket on
// reconnect), so no per-socket ref-counting is needed — mirrors the
// voice-presence registry next door.
const roomSpectators = new Map<string, Map<string, string>>();

export function getSpectatorNames(roomCode: string): string[] {
  return [...(roomSpectators.get(roomCode)?.values() ?? [])];
}

export function clearRoomSpectators(roomCode: string): void {
  roomSpectators.delete(roomCode);
}

/** Idempotent on `(roomCode, userId)`; refreshes the stored nickname. */
export function addSpectator(roomCode: string, userId: string, nickname: string): void {
  let room = roomSpectators.get(roomCode);
  if (!room) {
    room = new Map();
    roomSpectators.set(roomCode, room);
  }
  room.set(userId, nickname);
}

/** Returns the removed nickname, or `null` if the user wasn't tracked. */
export function removeSpectator(roomCode: string, userId: string): string | null {
  const room = roomSpectators.get(roomCode);
  const nickname = room?.get(userId);
  if (nickname == null) return null;
  room!.delete(userId);
  if (room!.size === 0) roomSpectators.delete(roomCode);
  return nickname;
}

/** Broadcasts the room's current spectator list. */
export function broadcastSpectatorList(io: SocketIOServer, roomCode: string): void {
  io.to(roomCode).emit('room:spectator_list', { spectators: getSpectatorNames(roomCode) });
}

/**
 * Single entry point for every "a spectator left" path (disconnect,
 * room:leave, future flows). Removes the user from the registry and emits
 * the resulting authoritative state to the rest of the room.
 *
 * When the user isn't tracked we *don't* broadcast (nothing changed), but
 * we do warn — every caller's precondition (`data.isSpectator === true` or
 * "user is in the pending-join queue") implies the user must be in the
 * registry, so a null here is the exact kind of state drift this refactor
 * was written to prevent. Logging gives operators a breadcrumb instead of
 * silently swallowing it the way the previous code did.
 */
export function broadcastSpectatorLeft(
  io: SocketIOServer,
  roomCode: string,
  userId: string,
): void {
  const nickname = removeSpectator(roomCode, userId);
  if (nickname == null) {
    console.warn('[spectate] broadcastSpectatorLeft called for untracked user', { roomCode, userId });
    return;
  }
  const spectators = getSpectatorNames(roomCode);
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

      addSpectator(roomCode, data.user.userId, data.user.nickname);

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
      if (!data.isSpectator || !data.roomCode) return;
      const roomCode = data.roomCode;
      const userId = data.user?.userId;
      if (!userId) return;

      if (removePendingSpectatorJoin(roomCode, userId)) {
        io.to(roomCode).emit('game:spectator_queue', {
          queue: getPendingSpectatorQueue(roomCode),
          nickname: data.user.nickname ?? '',
          joined: false,
        });
      }
      broadcastSpectatorLeft(io, roomCode, userId);
      clearUserRoom(kv, userId).catch((err) => {
        console.warn('[spectate] clearUserRoom on disconnect failed:', err);
      });
    });
  });
}

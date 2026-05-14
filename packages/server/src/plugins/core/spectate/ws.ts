import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../../../kv/types.js';
import type { SocketData } from '../../../ws/types.js';
import { deleteRoom, getRoom, clearUserRoom, ensureNotInRoom } from '../room/store.js';
import { GameSession } from '../game/session.js';
import { loadGameState } from '../game/state-store.js';
import { removePendingSpectatorJoin, getPendingSpectatorQueue } from '../../../ws/game-events.js';
import { joinRoomSocket } from '../../../ws/socket-room.js';

/**
 * Authoritative in-memory spectator registry, keyed by `userId` (not nickname
 * — nicknames can change between sessions and aren't unique on the wire) and
 * ref-counted by socket id so a user with multiple tabs only "leaves" when
 * their *last* spectator socket goes away.
 *
 * All mutation paths (room:spectate, room:leave, disconnect, promotion to
 * player, kick-to-spectate, round-start spectator marking) must funnel
 * through the helpers in this file. The previous bug was a path mutating
 * sockets directly (clearing `data.isSpectator`) while leaving this map
 * stale; centralising here is what prevents that class of drift.
 */
interface SpectatorEntry {
  nickname: string;
  sockets: Set<string>;
}
const roomSpectators = new Map<string, Map<string, SpectatorEntry>>();

export function getSpectatorNames(roomCode: string): string[] {
  const room = roomSpectators.get(roomCode);
  if (!room) return [];
  return [...room.values()].map((entry) => entry.nickname);
}

export function clearRoomSpectators(roomCode: string): void {
  roomSpectators.delete(roomCode);
}

/**
 * Track a spectator socket. Multiple calls with the same `(roomCode, userId)`
 * accumulate refs; the user is only considered gone once every socket has
 * been removed via {@link removeSpectatorSocket}.
 *
 * If `nickname` changed since the last call (re-login with new nickname),
 * the stored nickname is refreshed so future broadcasts use the current one.
 */
export function addSpectator(
  roomCode: string,
  userId: string,
  nickname: string,
  socketId: string,
): void {
  let room = roomSpectators.get(roomCode);
  if (!room) {
    room = new Map();
    roomSpectators.set(roomCode, room);
  }
  const existing = room.get(userId);
  if (existing) {
    existing.nickname = nickname;
    existing.sockets.add(socketId);
  } else {
    room.set(userId, { nickname, sockets: new Set([socketId]) });
  }
}

/**
 * Decrement a spectator's socket ref-count.
 *
 * Returns `{ removed: true, nickname }` if this was the last socket and the
 * user is now fully gone — caller should broadcast `room:spectator_left` in
 * that case. Returns `{ removed: false }` when the user still has other
 * sockets active (multi-tab) or wasn't tracked.
 */
export function removeSpectatorSocket(
  roomCode: string,
  userId: string,
  socketId: string,
): { removed: boolean; nickname?: string } {
  const room = roomSpectators.get(roomCode);
  if (!room) return { removed: false };
  const entry = room.get(userId);
  if (!entry) return { removed: false };
  entry.sockets.delete(socketId);
  if (entry.sockets.size > 0) return { removed: false };
  const nickname = entry.nickname;
  room.delete(userId);
  if (room.size === 0) roomSpectators.delete(roomCode);
  return { removed: true, nickname };
}

/**
 * Forcibly remove a user from the spectator registry regardless of how many
 * sockets they have. Use this for *role transitions* (spectator → player),
 * never for "the user left" — leaves should go through
 * {@link removeSpectatorSocket} so multi-tab users don't get yanked.
 */
export function removeSpectatorFully(roomCode: string, userId: string): void {
  const room = roomSpectators.get(roomCode);
  if (!room) return;
  room.delete(userId);
  if (room.size === 0) roomSpectators.delete(roomCode);
}

/**
 * Single source of truth for "a spectator left the room". Removes the
 * socket from the registry and, *only if it was the user's last socket*,
 * broadcasts `room:spectator_list` + `room:spectator_left` (with the
 * up-to-date list) to the rest of the room.
 *
 * Call this from every leave path — disconnect, room:leave, and any future
 * one — so the in-memory map and every connected client stay in lockstep.
 */
export function broadcastSpectatorLeftIfLast(
  io: SocketIOServer,
  roomCode: string,
  userId: string,
  socketId: string,
): void {
  const result = removeSpectatorSocket(roomCode, userId, socketId);
  if (!result.removed) return;
  const spectators = getSpectatorNames(roomCode);
  io.to(roomCode).emit('room:spectator_list', { spectators });
  io.to(roomCode).emit('room:spectator_left', {
    nickname: result.nickname ?? '',
    spectators,
  });
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

      addSpectator(roomCode, data.user.userId, data.user.nickname, socket.id);

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
      const nickname = data.user?.nickname ?? '';
      if (!userId) return;

      if (removePendingSpectatorJoin(roomCode, userId)) {
        io.to(roomCode).emit('game:spectator_queue', {
          queue: getPendingSpectatorQueue(roomCode),
          nickname,
          joined: false,
        });
      }
      broadcastSpectatorLeftIfLast(io, roomCode, userId, socket.id);
      clearUserRoom(kv, userId).catch((err) => {
        console.warn('[spectate] clearUserRoom on disconnect failed:', err);
      });
    });
  });
}

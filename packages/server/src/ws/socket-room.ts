import type { Socket } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import { setUserRoom, clearUserRoom } from '../plugins/core/room/store.js';
import type { SocketData } from './types.js';

/**
 * Atomically pair the three layers of "this socket is in this room":
 *   1. `data.roomCode` (in-memory socket state, used by handlers)
 *   2. `socket.join` (socket.io adapter membership, used for broadcasts)
 *   3. `user:${userId}:room` KV mapping (cross-process source of truth)
 *
 * All three must move together — any single call site that updates only some
 * of them re-introduces the state-drift class of bug this helper exists to prevent.
 */
export async function joinRoomSocket(
  kv: KvStore,
  socket: Socket,
  roomCode: string,
  opts?: { asSpectator?: boolean },
): Promise<void> {
  const data = socket.data as SocketData;
  data.roomCode = roomCode;
  if (opts?.asSpectator) data.isSpectator = true;
  await Promise.all([
    socket.join(roomCode),
    setUserRoom(kv, data.user.userId, roomCode),
  ]);
}

/**
 * Reverse of `joinRoomSocket`: drops the socket from the room across all three
 * layers. Always resets `isSpectator` so stale state from an earlier reconnect
 * attempt cannot leak into the next join.
 */
export async function leaveRoomSocket(
  kv: KvStore,
  socket: Socket,
  roomCode: string,
): Promise<void> {
  const data = socket.data as SocketData;
  data.roomCode = null;
  data.isSpectator = false;
  await Promise.all([
    Promise.resolve(socket.leave(roomCode)),
    clearUserRoom(kv, data.user.userId),
  ]);
}

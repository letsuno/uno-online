import type { KvStore } from '../kv/types.js';
import { setUserRoom, clearUserRoom } from '../plugins/core/room/store.js';
import type { SocketData } from './types.js';

/**
 * Minimal shape both `Socket` (live connection) and `RemoteSocket`
 * (returned by `io.in(...).fetchSockets()`) satisfy. The helpers below only
 * touch `data`, `join`, and `leave`, so this lets the same code clean up the
 * caller's own socket *and* someone else's socket (e.g. when the host kicks).
 */
interface RoomSocketLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  join(rooms: string | string[]): Promise<void> | void;
  leave(room: string): Promise<void> | void;
}

/**
 * Atomically pair the three layers of "this socket is in this room":
 *   1. `data.roomCode` (in-memory socket state, used by handlers)
 *   2. `socket.join` (socket.io adapter membership, used for broadcasts)
 *   3. `user:${userId}:room` KV mapping (cross-process source of truth)
 *
 * Also explicitly sets `data.isSpectator` (defaulting to `false`) so any prior
 * spectator flag from an earlier session cannot leak into a player join.
 *
 * All three layers must move together — any call site that updates only some
 * of them re-introduces the state-drift class of bug this helper exists to prevent.
 */
export async function joinRoomSocket(
  kv: KvStore,
  socket: RoomSocketLike,
  roomCode: string,
  opts?: { asSpectator?: boolean },
): Promise<void> {
  const data = socket.data as SocketData;
  data.roomCode = roomCode;
  data.isSpectator = opts?.asSpectator ?? false;
  await Promise.all([
    socket.join(roomCode),
    setUserRoom(kv, data.user.userId, roomCode),
  ]);
}

/**
 * Reverse of `joinRoomSocket`: drops the socket from the room across all three
 * layers. Always resets `isSpectator` so stale state from an earlier session
 * cannot leak into the next join.
 */
export async function leaveRoomSocket(
  kv: KvStore,
  socket: RoomSocketLike,
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

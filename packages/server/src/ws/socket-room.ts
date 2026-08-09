import type { KvStore } from '../kv/types.js';
import { setUserRoom, getUserRoom, clearUserRoomIfMatches } from '../plugins/core/room/store.js';
import type { SocketData } from './types.js';

/**
 * Minimal shape both `Socket` (live connection) and `RemoteSocket`
 * (returned by `io.in(...).fetchSockets()`) satisfy. The helpers below only
 * touch `data`, `join`, and `leave`, so this lets the same code clean up the
 * caller's own socket *and* someone else's socket (e.g. when the host kicks).
 */
interface RoomSocketLike {
  data: SocketData;
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
  const data = socket.data;
  const previousRoomCode = data.roomCode;
  const previousIsSpectator = data.isSpectator;
  const previousMappedRoom = await getUserRoom(kv, data.user.userId);
  let leftPreviousAdapterRoom = false;
  // A socket can only ever be in one room — leaving the previous adapter
  // membership here keeps broadcasts from two rooms from reaching one client
  // even if a caller forgets to clean up first.
  if (previousRoomCode && previousRoomCode !== roomCode) {
    await Promise.resolve(socket.leave(previousRoomCode));
    leftPreviousAdapterRoom = true;
  }
  try {
    await Promise.resolve(socket.join(roomCode));
    try {
      await setUserRoom(kv, data.user.userId, roomCode);
    } catch (error) {
      // A backend may commit and then surface a transport error. Verify the
      // durable result before rolling back a join that actually succeeded.
      if ((await getUserRoom(kv, data.user.userId)) !== roomCode) throw error;
    }
    data.roomCode = roomCode;
    data.isSpectator = opts?.asSpectator ?? false;
  } catch (error) {
    if (previousRoomCode !== roomCode) {
      await Promise.resolve(socket.leave(roomCode)).catch(rollbackError => {
        console.error(`[socketRoom] Failed to leave rolled-back room ${roomCode}:`, rollbackError);
      });
    }
    if (previousMappedRoom !== roomCode) {
      const cleared = await clearUserRoomIfMatches(kv, data.user.userId, roomCode).catch(rollbackError => {
        console.error(`[socketRoom] Failed to clear rolled-back mapping for ${data.user.userId}:`, rollbackError);
        return false;
      });
      if (cleared && previousMappedRoom) {
        await setUserRoom(kv, data.user.userId, previousMappedRoom).catch(rollbackError => {
          console.error(`[socketRoom] Failed to restore mapping for ${data.user.userId}:`, rollbackError);
        });
      }
    }
    if (leftPreviousAdapterRoom && previousRoomCode) {
      await Promise.resolve(socket.join(previousRoomCode)).catch(rollbackError => {
        console.error(`[socketRoom] Failed to restore adapter room ${previousRoomCode}:`, rollbackError);
      });
    }
    data.roomCode = previousRoomCode;
    data.isSpectator = previousIsSpectator;
    throw error;
  }
}

/**
 * Detach a socket from the room. Normal exits clear all three layers; active
 * player suspension passes preserveMembership so only the live socket layers
 * are dropped while the authoritative room membership remains.
 */
export async function leaveRoomSocket(
  kv: KvStore,
  socket: RoomSocketLike,
  roomCode: string,
  opts?: { preserveMembership?: boolean },
): Promise<void> {
  const data = socket.data;
  const wasCurrentRoom = data.roomCode === roomCode;
  const previousIsSpectator = data.isSpectator;
  const mappedRoomBefore = opts?.preserveMembership ? null : await getUserRoom(kv, data.user.userId);
  let membershipCleared = false;

  if (!opts?.preserveMembership) {
    try {
      membershipCleared = await clearUserRoomIfMatches(kv, data.user.userId, roomCode);
    } catch (error) {
      if ((await getUserRoom(kv, data.user.userId)) === roomCode) throw error;
      membershipCleared = mappedRoomBefore === roomCode;
    }
  }

  // A delayed cleanup for an old room can race a successful join of a new
  // room on the same socket. Always leave the requested adapter room, but do
  // not erase the newer in-memory membership.
  try {
    await Promise.resolve(socket.leave(roomCode));
  } catch (error) {
    if (membershipCleared && mappedRoomBefore === roomCode) {
      await setUserRoom(kv, data.user.userId, roomCode).catch(rollbackError => {
        console.error(`[socketRoom] Failed to restore mapping for ${data.user.userId}:`, rollbackError);
      });
    }
    data.isSpectator = previousIsSpectator;
    throw error;
  }

  if (wasCurrentRoom) {
    data.roomCode = null;
    data.isSpectator = false;
  }
}

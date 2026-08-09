import type { UnoServer as SocketIOServer } from './types.js';
import type { KvStore } from '../kv/types.js';
import {
  getRoom,
  getRoomSeats,
  getRoomSpectators,
  getSeatedPlayers,
  setRoomOwnerIfMatches,
} from '../plugins/core/room/store.js';
import type { GameSession } from '../plugins/core/game/session.js';
import { withRoomLifecycleLock } from './room-lifecycle-lock.js';
import { getLiveHumanRoomMemberIds } from './room-membership.js';

const OWNER_TRANSFER_DELAY_S = 10;
const ownerTransferTimers = new Map<
  string,
  {
    ownerId: string;
    timer: ReturnType<typeof setTimeout>;
  }
>();

let _io: SocketIOServer;
let _redis: KvStore;
let _sessions: Map<string, GameSession>;
let _armAllDisconnectTimer: (roomCode: string) => void;
let _isNextRoundExcluded: (roomCode: string, userId: string) => boolean;

export function configureOwnerTransfer(
  io: SocketIOServer,
  redis: KvStore,
  sessions: Map<string, GameSession>,
  armAllDisconnectTimer: (roomCode: string) => void,
  isNextRoundExcluded: (roomCode: string, userId: string) => boolean,
): void {
  _io = io;
  _redis = redis;
  _sessions = sessions;
  _armAllDisconnectTimer = armAllDisconnectTimer;
  _isNextRoundExcluded = isNextRoundExcluded;
}

export function cancelOwnerTransfer(roomCode: string): boolean {
  const pending = ownerTransferTimers.get(roomCode);
  if (!pending) return false;
  clearTimeout(pending.timer);
  ownerTransferTimers.delete(roomCode);
  return true;
}

export function cancelAllOwnerTransfers(): void {
  for (const { timer } of ownerTransferTimers.values()) clearTimeout(timer);
  ownerTransferTimers.clear();
}

async function getEligibleLiveOwner(
  roomCode: string,
  excludedOwnerId: string,
): Promise<{ nextOwnerId: string | null; liveHumanIds: Set<string> }> {
  const session = _sessions.get(roomCode);
  const [seats, spectators, liveHumanIds] = await Promise.all([
    getRoomSeats(_redis, roomCode),
    getRoomSpectators(_redis, roomCode),
    getLiveHumanRoomMemberIds(_io, _redis, roomCode, session),
  ]);
  const orderedIds = [
    ...getSeatedPlayers(seats)
      .filter(player => !player.isBot)
      .map(player => player.userId),
    ...spectators.map(spectator => spectator.userId),
    ...(session
      ?.getFullState()
      .players.filter(player => !player.isBot)
      .map(player => player.id) ?? []),
  ];
  const nextOwnerId =
    orderedIds.find(
      userId => userId !== excludedOwnerId && liveHumanIds.has(userId) && !_isNextRoundExcluded(roomCode, userId),
    ) ?? null;
  return { nextOwnerId, liveHumanIds };
}

/**
 * Immediate owner hand-off for callers that already hold the room lifecycle
 * lock. A failed hand-off deliberately leaves the previous owner in place:
 * offline membership alone is never promoted, and an active room with no
 * live humans is governed by the five-minute disconnect grace instead.
 */
export async function transferOwnerToLiveMemberUnlocked(roomCode: string, expectedOwnerId: string): Promise<boolean> {
  const room = await getRoom(_redis, roomCode);
  if (!room || room.ownerId !== expectedOwnerId) return false;

  const { nextOwnerId, liveHumanIds } = await getEligibleLiveOwner(roomCode, expectedOwnerId);
  if (!nextOwnerId) {
    if (liveHumanIds.size === 0) _armAllDisconnectTimer(roomCode);
    return false;
  }

  if (!(await setRoomOwnerIfMatches(_redis, roomCode, expectedOwnerId, nextOwnerId))) {
    return false;
  }
  // The CAS above is the durable commit boundary. Projection failures must
  // not report a false transfer failure and schedule the already-replaced
  // owner again.
  try {
    const updatedRoom = await getRoom(_redis, roomCode);
    if (!updatedRoom) throw new Error(`Room ${roomCode} disappeared after owner transfer`);
    _io.to(roomCode).emit('room:updated', { room: updatedRoom });
  } catch (error) {
    console.warn(`[ownerTransfer] Failed to broadcast committed owner in ${roomCode}:`, error);
  }

  // The candidate could disconnect after the first socket snapshot. Refresh
  // after committing and continue the chain instead of stranding an offline
  // owner until another terminal event happens.
  try {
    const freshLiveIds = await getLiveHumanRoomMemberIds(_io, _redis, roomCode, _sessions.get(roomCode));
    if (!freshLiveIds.has(nextOwnerId)) scheduleOwnerTransfer(roomCode, nextOwnerId);
  } catch (error) {
    console.warn(`[ownerTransfer] Failed to verify new owner in ${roomCode}:`, error);
    // Re-check after the ordinary delay. If the candidate is actually live,
    // the timer cancels itself; if not, the transfer chain continues.
    scheduleOwnerTransfer(roomCode, nextOwnerId);
  }
  return true;
}

export function scheduleOwnerTransfer(roomCode: string, ownerId: string): void {
  if (ownerTransferTimers.get(roomCode)?.ownerId === ownerId) return;
  cancelOwnerTransfer(roomCode);
  try {
    _io.to(roomCode).emit('room:owner_transfer_pending', {
      transferAt: Date.now() + OWNER_TRANSFER_DELAY_S * 1000,
    });
  } catch (error) {
    console.warn(`[ownerTransfer] Failed to broadcast pending transfer in ${roomCode}:`, error);
  }
  const timer = setTimeout(() => {
    void withRoomLifecycleLock(roomCode, async () => {
      if (ownerTransferTimers.get(roomCode)?.timer !== timer) return;
      ownerTransferTimers.delete(roomCode);
      const room = await getRoom(_redis, roomCode);
      if (!room || room.ownerId !== ownerId) return;

      const liveHumanIds = await getLiveHumanRoomMemberIds(_io, _redis, roomCode, _sessions.get(roomCode));
      if (liveHumanIds.has(ownerId)) {
        try {
          _io.to(roomCode).emit('room:owner_transfer_cancelled');
        } catch (error) {
          console.warn(`[ownerTransfer] Failed to broadcast cancellation in ${roomCode}:`, error);
        }
        return;
      }

      const transferred = await transferOwnerToLiveMemberUnlocked(roomCode, ownerId);
      if (!transferred) {
        try {
          _io.to(roomCode).emit('room:owner_transfer_cancelled');
        } catch (error) {
          console.warn(`[ownerTransfer] Failed to broadcast cancellation in ${roomCode}:`, error);
        }
      }
    }).catch((error: unknown) => {
      console.error(`[ownerTransfer] Failed for room ${roomCode}:`, error);
      // The registry entry was consumed before the fallible reads. Re-arm it
      // so a one-shot KV/adapter failure cannot strand an offline owner.
      if (!ownerTransferTimers.has(roomCode)) scheduleOwnerTransfer(roomCode, ownerId);
    });
  }, OWNER_TRANSFER_DELAY_S * 1000);
  timer.unref?.();
  ownerTransferTimers.set(roomCode, { ownerId, timer });
}

export async function checkOwnerDisconnectedAtTerminal(roomCode: string, session: GameSession): Promise<void> {
  const room = await getRoom(_redis, roomCode);
  if (!room) return;
  const liveHumanIds = await getLiveHumanRoomMemberIds(_io, _redis, roomCode, session);
  if (!liveHumanIds.has(room.ownerId)) scheduleOwnerTransfer(roomCode, room.ownerId);
}

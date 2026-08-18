import type { RoomDissolveReason } from '@uno-online/shared';
import type { UnoServer as SocketIOServer } from './types.js';
import type { KvStore } from '../kv/types.js';
import type { GameSession } from '../plugins/core/game/session.js';
import { deleteRoom, clearUserRoomIfMatches, getRoomStorageKeys } from '../plugins/core/room/store.js';
import type { TurnTimer } from '../plugins/core/game/turn-timer.js';
import type { GameStatePersister } from '../plugins/core/game/state-store.js';
import type { VoiceChannelManager } from '../voice/channel-manager.js';
import { clearRoomTimeouts } from './room-events.js';
import { clearPendingSpectatorJoins, clearRoomVoteState, clearAutopilotJumpIn } from './game-events.js';
import { clearPendingSwapRequests } from './seat-events.js';
import { leaveRoomSocket } from './socket-room.js';
import { clearVoicePresence } from './voice-presence.js';
import { broadcastLobbyRooms } from '../plugins/core/spectate/routes.js';
import { withRoomLifecycleLock } from './room-lifecycle-lock.js';
import { getHumanRoomMemberIds } from './room-membership.js';
import { cancelOwnerTransfer } from './owner-transfer.js';

export async function dissolveRoom(
  io: SocketIOServer,
  kv: KvStore,
  roomCode: string,
  sessions: Map<string, GameSession>,
  turnTimer: TurnTimer,
  persister: GameStatePersister,
  reason: RoomDissolveReason,
  voiceChannels: Pick<VoiceChannelManager, 'deleteRoomChannel'>,
  runtimeCleanup: (roomCode: string) => void,
): Promise<void> {
  return withRoomLifecycleLock(roomCode, () =>
    dissolveRoomUnlocked(io, kv, roomCode, sessions, turnTimer, persister, reason, voiceChannels, runtimeCleanup),
  );
}

/** Room teardown for callers that already hold the room lifecycle lock. */
export async function dissolveRoomUnlocked(
  io: SocketIOServer,
  kv: KvStore,
  roomCode: string,
  sessions: Map<string, GameSession>,
  turnTimer: TurnTimer,
  persister: GameStatePersister,
  reason: RoomDissolveReason,
  voiceChannels: Pick<VoiceChannelManager, 'deleteRoomChannel'>,
  runtimeCleanup: (roomCode: string) => void,
): Promise<void> {
  const session = sessions.get(roomCode);
  const [memberIds, sockets] = await Promise.all([
    getHumanRoomMemberIds(kv, roomCode, session),
    io.in(roomCode).fetchSockets(),
  ]);
  for (const roomSocket of sockets) {
    memberIds.add(roomSocket.data.user.userId);
  }

  // Establish the snapshot tombstone/barrier first, then make the durable
  // multi-key deletion the teardown commit point. Until it succeeds every
  // timer, session, socket and runtime registry remains usable.
  await persister.cleanup(roomCode);
  try {
    await deleteRoom(kv, roomCode);
  } catch (error) {
    // Redis can execute the multi-key DEL and then lose only the response.
    // Exact-key reads distinguish that committed outcome from a deletion that
    // definitely did not complete. Tearing down after a confirmed commit is
    // safe; reviving the persister there would allow a stale game snapshot to
    // recreate part of a room that has already been durably removed.
    let deletionCommitted: boolean;
    try {
      const keys = getRoomStorageKeys(roomCode);
      const matches = await Promise.all(keys.map(key => kv.keys(key)));
      deletionCommitted = !matches.some((found, index) => found.includes(keys[index]!));
    } catch (verificationError) {
      // The delete outcome is still ambiguous because the read-back failed.
      // Keep the tombstone and runtime intact. A caller may safely retry the
      // idempotent dissolve; only a positively observed surviving key is
      // sufficient evidence to revive snapshot persistence below.
      throw verificationError;
    }

    if (!deletionCommitted) {
      // cleanup() tombstoned the room and discarded its pending dirty state.
      // Roll that internal barrier back and best-effort republish the still-live
      // session so a transient KV deletion failure cannot strand an active game
      // without a resumable snapshot. Never mask the original delete error.
      try {
        persister.revive(roomCode);
        const currentSession = sessions.get(roomCode);
        if (currentSession) {
          persister.markDirty(roomCode, currentSession.getFullState());
          await persister.flushNow(roomCode);
        }
      } catch (recoveryError) {
        // The runtime/session are deliberately untouched and can be dirtied by
        // the next game event even if this recovery flush also fails.
        console.error(`[roomLifecycle] Failed to republish ${roomCode} after delete failure:`, recoveryError);
      }
      throw error;
    }
    // All authoritative room/game keys are absent: DEL committed even though
    // its transport response failed. Continue committed teardown.
  }

  const attempt = (operation: () => unknown): Promise<unknown> => {
    try {
      return Promise.resolve(operation());
    } catch (error) {
      return Promise.reject(error);
    }
  };

  // Once deletion commits there is nothing to roll back. Keep each runtime
  // cleanup independent so one plugin registry cannot leave the rest alive.
  await Promise.allSettled([
    attempt(() => runtimeCleanup(roomCode)),
    attempt(() => turnTimer.stop(roomCode)),
    attempt(() => cancelOwnerTransfer(roomCode)),
    attempt(() => clearRoomTimeouts(roomCode)),
    attempt(() => clearPendingSpectatorJoins(roomCode)),
    attempt(() => clearRoomVoteState(roomCode)),
    attempt(() => clearAutopilotJumpIn(roomCode)),
    attempt(() => clearPendingSwapRequests(roomCode)),
    attempt(() => session?.clearChatHistory()),
    attempt(() => sessions.delete(roomCode)),
  ]);

  // Broadcast before detaching sockets. Voice/chat notification failures are
  // isolated from the authoritative dissolved event and from each other.
  await Promise.allSettled([
    attempt(() => io.to(roomCode).emit('chat:cleared')),
    attempt(() => clearVoicePresence(io, roomCode)),
  ]);

  // The event carries the old room code and clients compare before clearing,
  // so notify every collected identity even if its reverse mapping already
  // moved or failed to clear. Mapping and notification are independent work:
  // neither failure may suppress the other.
  await Promise.allSettled(
    [...memberIds].flatMap(userId => [
      attempt(() => clearUserRoomIfMatches(kv, userId, roomCode)),
      attempt(() =>
        io.to(`user:${userId}`).emit('room:membership_ended', {
          roomCode,
          reason,
        }),
      ),
    ]),
  );

  // Reverse mappings were handled independently above. Adapter failures for
  // one socket must not prevent the remaining sockets from being detached.
  await Promise.allSettled(
    sockets.map(roomSocket => attempt(() => leaveRoomSocket(kv, roomSocket, roomCode, { preserveMembership: true }))),
  );

  await Promise.allSettled([
    attempt(() => voiceChannels.deleteRoomChannel(roomCode)),
    attempt(() => broadcastLobbyRooms(kv, io)),
  ]);
}

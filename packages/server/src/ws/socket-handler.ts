import type { UnoServer as SocketIOServer, UnoSocket as Socket } from './types.js';
import type { KvStore } from '../kv/types.js';
import { authenticateSocketAsync } from '../auth/middleware.js';
import { RoomManager } from '../plugins/core/room/manager.js';
import { TurnTimer } from '../plugins/core/game/turn-timer.js';
import { GameSession } from '../plugins/core/game/session.js';
import {
  registerRoomEvents,
  emitGameUpdate,
  startTurnTimer,
  ensureTurnDriver,
  executeAutopilot,
  notifyAutopilotAction,
  resetPlayerTimeout,
  rearmBlitzAfterRestore,
  clearAllRoomEventTimers,
} from './room-events.js';
import { getAutopilotActionPlayerId, canPlayerAutopilotOnce } from './autopilot-action-player.js';
import {
  registerGameEvents,
  driveCommittedActionPostcommit,
  addAutopilotVote,
  removePlayerVote,
  clearChatTimestamps,
  getRoundEndVoteState,
  getPendingSpectatorQueue,
  getRoundEndAt,
  removePendingSpectatorJoin,
  reseedTerminalVotes,
  clearAllGameEventTimers,
} from './game-events.js';
import {
  getRoom,
  clearUserRoomIfMatches,
  getUserRoom,
  setUserRoom,
  ensureNotInRoom,
  setSeatPlayerConnected,
  getRoomSeats,
  getRoomSpectators,
  addSpectatorWithMembership,
  removeMemberWithMembership,
  setSpectatorConnected,
  markAllMembersDisconnected,
  setRoomRoster,
  setSeatConnectionAndDeparture,
} from '../plugins/core/room/store.js';
import {
  registerSeatEvents,
  clearAllSeatSwapState,
  clearPendingSwapRequests,
  clearUserSwapRequests,
} from './seat-events.js';
import { joinRoomSocket, leaveRoomSocket } from './socket-room.js';
import {
  loadGameState,
  loadGameStateForRestore,
  GameStateCorruptionError,
  GameStatePersister,
} from '../plugins/core/game/state-store.js';
import { broadcastLobbyRooms, getActiveRooms } from '../plugins/core/spectate/routes.js';
import { checkRateLimit, clearRateLimit } from './rate-limiter.js';
import { registerInteractionEvents, clearThrowTimestamp } from '../plugins/core/interaction/ws.js';
import { broadcastSpectatorList, broadcastSpectatorLeft, toSpectatorView } from '../plugins/core/spectate/ws.js';
import { dissolveRoom, dissolveRoomUnlocked } from './room-lifecycle.js';
import {
  cancelAllOwnerTransfers,
  cancelOwnerTransfer,
  scheduleOwnerTransfer,
  configureOwnerTransfer,
  checkOwnerDisconnectedAtTerminal,
} from './owner-transfer.js';
import { registerVoicePresenceEvents, removeVoicePresence, removeVoicePresenceForSocket } from './voice-presence.js';
import { VoiceChannelManager } from '../voice/channel-manager.js';
import type { MumbleIceConfig } from '../config.js';
import { AUTOPILOT_TOGGLE_COOLDOWN_MS, PROTOCOL_VERSION, automationStateFingerprint } from '@uno-online/shared';
import { isNextRoundExcluded } from '../plugins/core/game/lifecycle-state.js';
import { drainRoomLifecycleLocks, withRoomLifecycleLock } from './room-lifecycle-lock.js';
import { getHumanRoomMemberIds, getLiveHumanRoomMemberIds } from './room-membership.js';
import { drainUserMembershipLocks, withUserMembershipLock } from './user-membership-lock.js';
import { clearMemberDeparted, getDepartedMemberIds, markMemberDeparted } from './room-departure.js';
import { reconcileRoomRosterFromGameState, RoomRosterCorruptionError } from './room-roster-reconcile.js';
import { isRoomCode } from './payload-validation.js';

const RECONNECT_TIMEOUT_MS = 30_000;
const AUTOPILOT_THINK_MS = 2_000;
const ROOM_IDLE_SWEEP_MS = 60_000;
const GAME_STATE_TTL_SAFETY_MS = 30_000;
const ALL_DISCONNECT_TIMEOUT_MS = 5 * 60_000;
const STARTUP_RECONCILE_RETRY_MS = 1_000;
const STARTUP_RECONCILE_MAX_ATTEMPTS = 3;
const WAITING_EVICTION_MAX_ATTEMPTS = 3;

const autopilotToggleTimestamps = new Map<string, number>();

function isCorruptRestoreError(error: unknown): boolean {
  return error instanceof GameStateCorruptionError || error instanceof RoomRosterCorruptionError;
}

/**
 * A snapshot must survive until the idle sweeper can observe and delete its
 * room. A room may become idle immediately after one sweep, so include the
 * complete sweep interval plus a small scheduling cushion.
 */
export function getGameStateTtlSeconds(roomIdleTimeoutMs: number): number {
  return Math.ceil((roomIdleTimeoutMs + ROOM_IDLE_SWEEP_MS + GAME_STATE_TTL_SAFETY_MS) / 1000);
}

// Re-emit the terminal-state event (round_end / game_over) to a reconnecting
// socket so it can anchor cooldown timers to the original server timestamp,
// instead of re-deriving them from "now".
function replayTerminalEvent(socket: Socket, roomCode: string, session: GameSession): void {
  const state = session.getFullState();
  if (state.phase !== 'round_end' && state.phase !== 'game_over') return;
  const endAt = getRoundEndAt(roomCode);
  if (!endAt) return;
  const scores = Object.fromEntries(state.players.map(p => [p.id, p.score]));
  if (state.phase === 'game_over') {
    socket.emit('game:over', { winnerId: state.winnerId, scores, gameOverAt: endAt });
  } else {
    socket.emit('game:round_end', { winnerId: state.winnerId, scores, roundEndAt: endAt });
  }
}

export function setupSocketHandlers(
  io: SocketIOServer,
  redis: KvStore,
  jwtSecret: string,
  roomIdleTimeoutMs: number,
  mumbleIce: MumbleIceConfig,
) {
  let closing = false;
  const activeOperations = new Set<Promise<unknown>>();
  const roomManager = new RoomManager(redis);
  const turnTimer = new TurnTimer();
  const sessions = new Map<string, GameSession>();
  // Keyed by userId; roomCode records which room the pending cleanup belongs
  // to, so it is only ever cancelled by a rejoin of THAT room — cancelling on
  // mere reconnection (or on rejoin of another room) leaves ghost seats behind.
  const disconnectTimers = new Map<string, { roomCode: string; timer: ReturnType<typeof setTimeout> }>();
  const allDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const startupReconcileTimers = new Map<
    string,
    {
      roomCreatedAt: string | null;
      attempt: number;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  // Retries that fail before reading a room identity may only inspect rooms
  // that already existed when this handler instance started. Once an identity
  // is observed, retries use the exact persisted createdAt value instead.
  const startupReconcileCutoffMs = Date.now();
  const autoPlayIntervals = new Map<
    string,
    {
      roomCode: string;
      session: GameSession;
      timer: ReturnType<typeof setInterval>;
      running: boolean;
    }
  >();
  const userSocketMap = new Map<string, string>();
  // Snapshot TTL follows the room's idle lifetime — a snapshot must outlive
  // its room, or late rejoins meet a playing room with nothing to restore.
  const persister = new GameStatePersister(redis, getGameStateTtlSeconds(roomIdleTimeoutMs));
  const voiceChannels = new VoiceChannelManager(redis, mumbleIce);

  function trackOperation<T>(operation: Promise<T>): Promise<T> {
    activeOperations.add(operation);
    void operation.then(
      () => activeOperations.delete(operation),
      () => activeOperations.delete(operation),
    );
    return operation;
  }

  async function drainActiveOperations(): Promise<void> {
    while (activeOperations.size > 0) {
      await Promise.allSettled([...activeOperations]);
    }
  }

  function trackSocketListeners(socket: Socket): void {
    type Listener = (...args: unknown[]) => unknown;
    const mutableSocket = socket as unknown as {
      on: (event: string, listener: Listener) => unknown;
    };
    const originalOn = mutableSocket.on.bind(socket);
    mutableSocket.on = (event, listener) =>
      originalOn(event, (...args) => {
        const operation = trackOperation(Promise.resolve().then(() => listener(...args)));
        void operation.catch(error => {
          console.error(`[socket:${event}] Unhandled listener failure:`, error);
        });
        return operation;
      });
  }

  void trackOperation(voiceChannels.reconcileActiveRooms()).catch(err =>
    console.warn('[voice] reconcile failed:', err),
  );

  io.use((socket, next) => {
    const authentication = (async () => {
      if (closing) return next(new Error('Server shutting down'));
      if (socket.handshake.auth?.['protocolVersion'] !== PROTOCOL_VERSION) {
        return next(new Error('Protocol mismatch'));
      }
      const payload = await authenticateSocketAsync(socket, jwtSecret);
      // Authentication may involve an API-key database query. Re-check the
      // gate after it settles so a handshake admitted before shutdown cannot
      // become a late connection after the operation drain.
      if (closing) return next(new Error('Server shutting down'));
      if (!payload) {
        return next(new Error('Authentication failed'));
      }
      socket.data.user = payload;
      socket.data.roomCode = null;
      socket.data.isSpectator = false;
      next();
    })();
    void trackOperation(authentication).catch((error: unknown) => {
      next(error instanceof Error ? error : new Error('Authentication failed'));
    });
  });

  io.use((socket, next) => {
    socket.use(([_event], next) => {
      if (closing) return next(new Error('Server shutting down'));
      if (!checkRateLimit(socket.id)) {
        return next(new Error('Rate limited'));
      }
      next();
    });
    next();
  });

  function stopAutoPlay(userId: string) {
    const entry = autoPlayIntervals.get(userId);
    if (entry) {
      clearInterval(entry.timer);
      autoPlayIntervals.delete(userId);
    }
  }

  function startAutoPlay(userId: string, roomCode: string) {
    if (closing) return;
    stopAutoPlay(userId);
    const expectedSession = sessions.get(roomCode);
    if (!expectedSession) return;
    let entry: {
      roomCode: string;
      session: GameSession;
      timer: ReturnType<typeof setInterval>;
      running: boolean;
    };
    entry = {
      roomCode,
      session: expectedSession,
      timer: setInterval(() => {
        if (autoPlayIntervals.get(userId) !== entry || entry.running) return;
        entry.running = true;
        void trackOperation(
          withRoomLifecycleLock(roomCode, async () => {
            if (autoPlayIntervals.get(userId) !== entry || sessions.get(roomCode) !== expectedSession) {
              stopAutoPlay(userId);
              return;
            }
            const state = expectedSession.getFullState();
            if (state.phase === 'round_end' || state.phase === 'game_over') {
              stopAutoPlay(userId);
              return;
            }
            if (getAutopilotActionPlayerId(state) !== userId) return;

            const isStillValid = () =>
              autoPlayIntervals.get(userId) === entry && sessions.get(roomCode) === expectedSession;
            const acted = await executeAutopilot(
              expectedSession,
              userId,
              async () => {
                persister.markDirty(roomCode, expectedSession.getFullState());
              },
              action => notifyAutopilotAction(roomCode, expectedSession, action),
              isStillValid,
            );

            if (!isStillValid()) return;
            if (acted) {
              persister.markDirty(roomCode, expectedSession.getFullState());
              const expectedAfterFingerprint = automationStateFingerprint(expectedSession.getFullState());
              const terminal = await driveCommittedActionPostcommit(
                io,
                redis,
                roomCode,
                expectedSession,
                turnTimer,
                sessions,
                persister,
                {
                  lockHeld: true,
                  touchActivity: false,
                  startNextTurn: false,
                  context: 'autoplay',
                },
              );
              if (terminal) {
                stopAutoPlay(userId);
                return;
              }
              if (
                !isStillValid() ||
                automationStateFingerprint(expectedSession.getFullState()) !== expectedAfterFingerprint
              )
                return;
              io.to(roomCode).emit('player:timeout', { playerId: userId });
              startTurnTimer(io, redis, roomCode, expectedSession, turnTimer, sessions, persister);
            }
          }),
        )
          .catch(error => {
            console.error(`[autoplay] Failed for ${userId} in ${roomCode}:`, error);
          })
          .finally(() => {
            entry.running = false;
          });
      }, AUTOPILOT_THINK_MS),
      running: false,
    };
    entry.timer.unref?.();
    autoPlayIntervals.set(userId, entry);
  }

  function cancelDissolutionTimer(roomCode: string) {
    const timer = allDisconnectTimers.get(roomCode);
    if (timer) {
      clearTimeout(timer);
      allDisconnectTimers.delete(roomCode);
    }
  }

  // The ONLY path that may dissolve a room with a live session over lost
  // connections. Per-player 30s timers and the spectator sweep must not
  // dissolve directly — they'd cut the 5-minute all-disconnect grace down
  // to whichever 30s window expires first.
  function armAllDisconnectTimer(roomCode: string, delayMs = ALL_DISCONNECT_TIMEOUT_MS) {
    if (closing) return;
    if (allDisconnectTimers.has(roomCode)) return;
    const dissolutionTimer = setTimeout(() => {
      // Sessions are restored lazily — a post-restart in-game room may have
      // none. The kv room is the source of truth for "still exists".
      // Humans may be back without having cancelled this timer — spectator
      // rejoins never cancel it, and the startup reconcile can leave stale
      // flags. Never dissolve over live people; the next full disconnect
      // re-arms.
      void trackOperation(
        (async () => {
          try {
            await withRoomLifecycleLock(roomCode, async () => {
              if (allDisconnectTimers.get(roomCode) !== dissolutionTimer) return;
              allDisconnectTimers.delete(roomCode);
              if (!(await getRoom(redis, roomCode))) return;
              const liveHumanIds = await getLiveHumanRoomMemberIds(io, redis, roomCode, sessions.get(roomCode));
              if (liveHumanIds.size > 0) return;
              await dissolveRoomUnlocked(
                io,
                redis,
                roomCode,
                sessions,
                turnTimer,
                persister,
                'idle_timeout',
                voiceChannels,
                stopAutoPlayForRoom,
              );
            });
          } catch (err) {
            console.error(`[allDisconnect] Failed to dissolve room ${roomCode}:`, err);
            try {
              const room = await getRoom(redis, roomCode);
              if (!room) return;
              const liveHumanIds = await getLiveHumanRoomMemberIds(io, redis, roomCode, sessions.get(roomCode));
              if (liveHumanIds.size === 0) armAllDisconnectTimer(roomCode, 1_000);
            } catch (retryCheckError) {
              console.warn(`[allDisconnect] Failed to verify retry for ${roomCode}:`, retryCheckError);
              armAllDisconnectTimer(roomCode, 1_000);
            }
          }
        })(),
      );
    }, delayMs);
    dissolutionTimer.unref?.();
    allDisconnectTimers.set(roomCode, dissolutionTimer);
  }

  function stopAutoPlayForRoom(roomCode: string) {
    for (const [userId, entry] of autoPlayIntervals) {
      if (entry.roomCode === roomCode) stopAutoPlay(userId);
    }
    for (const [userId, entry] of disconnectTimers) {
      if (entry.roomCode === roomCode) {
        clearTimeout(entry.timer);
        disconnectTimers.delete(userId);
      }
    }
    cancelDissolutionTimer(roomCode);
    cancelOwnerTransfer(roomCode);
  }

  configureOwnerTransfer(io, redis, sessions, armAllDisconnectTimer, isNextRoundExcluded);

  async function reconcileOwnerAfterRejoin(roomCode: string, returningUserId: string): Promise<void> {
    cancelDissolutionTimer(roomCode);
    const room = await getRoom(redis, roomCode);
    if (!room) return;

    if (room.ownerId === returningUserId) {
      if (cancelOwnerTransfer(roomCode)) {
        io.to(roomCode).emit('room:owner_transfer_cancelled');
      }
      return;
    }

    const session = sessions.get(roomCode);
    const terminal = session?.isRoundEnd() || session?.isGameOver();
    if (session ? !terminal : room.status !== 'waiting') return;
    if (isNextRoundExcluded(roomCode, returningUserId)) return;

    const liveHumanIds = await getLiveHumanRoomMemberIds(io, redis, roomCode, session);
    if (!liveHumanIds.has(room.ownerId)) scheduleOwnerTransfer(roomCode, room.ownerId);
  }

  async function onRoomMemberReconnected(
    roomCode: string,
    userId: string,
    options?: { departureAlreadyCleared?: boolean },
  ): Promise<void> {
    if (!options?.departureAlreadyCleared) {
      await clearMemberDeparted(redis, roomCode, userId);
    }
    const pendingDisconnect = disconnectTimers.get(userId);
    if (pendingDisconnect?.roomCode === roomCode) {
      clearTimeout(pendingDisconnect.timer);
      disconnectTimers.delete(userId);
      stopAutoPlay(userId);
    }
    await reconcileOwnerAfterRejoin(roomCode, userId);
  }

  async function restoreDepartureMarker(roomCode: string, userId: string, wasDeparted: boolean): Promise<void> {
    if (wasDeparted) {
      await markMemberDeparted(redis, roomCode, userId);
    } else {
      await clearMemberDeparted(redis, roomCode, userId);
    }
  }

  function scheduleActivePlayerGovernance(roomCode: string, userId: string): void {
    if (closing) return;
    const previous = disconnectTimers.get(userId);
    if (previous) clearTimeout(previous.timer);
    const timer = setTimeout(() => {
      void trackOperation(
        withRoomLifecycleLock(roomCode, async () => {
          if (disconnectTimers.get(userId)?.timer !== timer) return;
          disconnectTimers.delete(userId);
          const session = sessions.get(roomCode);
          if (!session) return;
          const stillDisconnected = session
            .getFullState()
            .players.find(player => player.id === userId && !player.connected);
          if (!stillDisconnected) return;

          session.setPlayerAutopilot(userId, true);
          persister.markDirty(roomCode, session.getFullState());
          await emitGameUpdate(io, roomCode, session, redis).catch(error => {
            console.warn(`[disconnect] Post-commit autopilot projection failed in ${roomCode}:`, error);
          });
          io.to(roomCode).emit('player:autopilot', { playerId: userId, enabled: true });
          addAutopilotVote(roomCode, userId, session, io);
          startAutoPlay(userId, roomCode);

          const liveHumanIds = await getLiveHumanRoomMemberIds(io, redis, roomCode, session);
          if (liveHumanIds.size === 0) armAllDisconnectTimer(roomCode);
        }),
      ).catch(error => console.error(`[disconnect] Failed to enable autopilot in ${roomCode}:`, error));
    }, RECONNECT_TIMEOUT_MS);
    timer.unref?.();
    disconnectTimers.set(userId, { roomCode, timer });
  }

  function armWaitingMemberEvictionTimer(roomCode: string, userId: string, delayMs: number, attempt = 1): void {
    if (closing) return;
    const previous = disconnectTimers.get(userId);
    if (previous) clearTimeout(previous.timer);
    const timer = setTimeout(() => {
      void trackOperation(runWaitingMemberEviction(roomCode, userId, timer, attempt));
    }, delayMs);
    timer.unref?.();
    disconnectTimers.set(userId, { roomCode, timer });
  }

  async function runWaitingMemberEviction(
    roomCode: string,
    userId: string,
    timer: ReturnType<typeof setTimeout>,
    attempt: number,
  ): Promise<void> {
    try {
      await withUserMembershipLock(userId, () =>
        withRoomLifecycleLock(roomCode, async () => {
          if (disconnectTimers.get(userId)?.timer !== timer) return;
          const finish = () => {
            if (disconnectTimers.get(userId)?.timer === timer) {
              disconnectTimers.delete(userId);
            }
          };
          const [roomBeforeEviction, seatsBeforeEviction, spectatorsBeforeEviction] = await Promise.all([
            getRoom(redis, roomCode),
            getRoomSeats(redis, roomCode),
            getRoomSpectators(redis, roomCode),
          ]);
          if (
            !roomBeforeEviction ||
            roomBeforeEviction.status !== 'waiting' ||
            sessions.has(roomCode) ||
            spectatorsBeforeEviction.some(spectator => spectator.userId === userId) ||
            !seatsBeforeEviction.some(seat => seat?.userId === userId)
          ) {
            finish();
            return;
          }
          const liveHumanIds = await getLiveHumanRoomMemberIds(io, redis, roomCode);
          if (liveHumanIds.has(userId)) {
            finish();
            return;
          }

          const hasOtherHumanMember =
            seatsBeforeEviction.some(seat => seat && !seat.isBot && seat.userId !== userId) ||
            spectatorsBeforeEviction.some(spectator => spectator.userId !== userId);
          if (!hasOtherHumanMember) {
            // Keep the final member's roster and reverse mapping intact until
            // dissolveRoom commits the durable room deletion. This also lets
            // teardown collect and notify the disconnected identity.
            await dissolveRoomUnlocked(
              io,
              redis,
              roomCode,
              sessions,
              turnTimer,
              persister,
              'empty',
              voiceChannels,
              stopAutoPlayForRoom,
            );
            finish();
            return;
          }

          const wasOwner = roomBeforeEviction.ownerId === userId;
          const membership = await removeMemberWithMembership(redis, roomCode, userId);

          // Durable roster + mapping removal is committed. Owner/all-disconnect
          // governance must run before fallible projection work.
          if (wasOwner) scheduleOwnerTransfer(roomCode, userId);
          // The evicted seat may have been the last live human while a durable
          // (for example explicitly departed) spectator still keeps the roster
          // non-empty. Re-evaluate after the eviction commit; otherwise that
          // room has neither another disconnect event nor a session timer that
          // can ever start the five-minute zombie-room grace.
          try {
            const liveAfterEviction = await getLiveHumanRoomMemberIds(io, redis, roomCode);
            if (liveAfterEviction.size === 0) armAllDisconnectTimer(roomCode);
          } catch (error) {
            console.warn(`[disconnect] Failed to inspect live members after eviction in ${roomCode}:`, error);
            armAllDisconnectTimer(roomCode);
          }

          const updatedRoom = await getRoom(redis, roomCode).catch(() => roomBeforeEviction);
          io.to(roomCode).emit('seat:updated', {
            seats: membership.seats,
            spectators: membership.spectators,
          });
          if (updatedRoom) io.to(roomCode).emit('room:updated', { room: updatedRoom });
          finish();
        }),
      );
    } catch (error) {
      const ownsTimer = disconnectTimers.get(userId)?.timer === timer;
      if (ownsTimer && attempt < WAITING_EVICTION_MAX_ATTEMPTS) {
        console.error(
          `[disconnect] Failed to evict waiting member in ${roomCode}; retry ${attempt + 1}/${WAITING_EVICTION_MAX_ATTEMPTS}:`,
          error,
        );
        armWaitingMemberEvictionTimer(roomCode, userId, 1_000, attempt + 1);
      } else {
        if (ownsTimer) disconnectTimers.delete(userId);
        console.error(`[disconnect] Failed to evict waiting member in ${roomCode} after ${attempt} attempts:`, error);
      }
    }
  }

  async function scheduleWaitingMemberEviction(roomCode: string, userId: string): Promise<void> {
    const room = await getRoom(redis, roomCode);
    if (!room || room.status !== 'waiting' || sessions.has(roomCode)) return;
    if (room.ownerId === userId) scheduleOwnerTransfer(roomCode, userId);
    armWaitingMemberEvictionTimer(roomCode, userId, RECONNECT_TIMEOUT_MS);
  }

  async function getRoomCodes(): Promise<string[]> {
    const keys = await redis.keys('room:*');
    return keys.filter(key => /^room:[^:]+$/u.test(key)).map(key => key.slice('room:'.length));
  }

  async function cleanupIdleRooms() {
    const roomCodes = await getRoomCodes();
    const now = Date.now();
    for (const roomCode of roomCodes) {
      await withRoomLifecycleLock(roomCode, async () => {
        const room = await getRoom(redis, roomCode);
        if (!room) {
          // The key exists (getRoomCodes listed it) but doesn't parse as a
          // room — a handler racing dissolveRoom re-created a partial hash
          // (e.g. touchRoomActivity's hset after deleteRoom). Nothing can
          // ever revive it and `continue` would keep it forever; collect it
          // and its satellites now.
          // A malformed hash may still own snapshots, mappings, timers,
          // adapter members and a live session. Use the unified committed
          // teardown boundary instead of deleting only part of its KV state.
          await dissolveRoomUnlocked(
            io,
            redis,
            roomCode,
            sessions,
            turnTimer,
            persister,
            'empty',
            voiceChannels,
            stopAutoPlayForRoom,
          );
          return;
        }
        const lastActivityAt = Date.parse(room.lastActivityAt);
        if (now - lastActivityAt < roomIdleTimeoutMs) return;

        await dissolveRoomUnlocked(
          io,
          redis,
          roomCode,
          sessions,
          turnTimer,
          persister,
          'idle_timeout',
          voiceChannels,
          stopAutoPlayForRoom,
        );
      });
    }
  }

  function scheduleStartupReconcileRetry(roomCode: string, roomCreatedAt: string | null, attempt: number): void {
    if (closing) return;
    const existing = startupReconcileTimers.get(roomCode);
    if (existing?.roomCreatedAt === roomCreatedAt && existing.attempt >= attempt) return;
    if (existing) clearTimeout(existing.timer);

    let entry: {
      roomCreatedAt: string | null;
      attempt: number;
      timer: ReturnType<typeof setTimeout>;
    };
    entry = {
      roomCreatedAt,
      attempt,
      timer: setTimeout(() => {
        if (startupReconcileTimers.get(roomCode) !== entry) return;
        startupReconcileTimers.delete(roomCode);
        void trackOperation(reconcileStartupRoom(roomCode, roomCreatedAt, attempt));
      }, STARTUP_RECONCILE_RETRY_MS),
    };
    entry.timer.unref?.();
    startupReconcileTimers.set(roomCode, entry);
  }

  /**
   * Reconcile one startup room independently. Once known, `expectedCreatedAt`
   * binds a retry to the exact failed room. Before identity is readable, the
   * startup cutoff prevents an old retry from touching a newly-created room.
   */
  async function reconcileStartupRoom(
    roomCode: string,
    expectedCreatedAt: string | null = null,
    attempt = 1,
  ): Promise<void> {
    let roomCreatedAt: string | null = expectedCreatedAt;
    try {
      await withRoomLifecycleLock(roomCode, async () => {
        const room = await getRoom(redis, roomCode);
        if (!room) return;
        if (expectedCreatedAt) {
          if (room.createdAt !== expectedCreatedAt) return;
        } else {
          const createdAtMs = Date.parse(room.createdAt);
          if (createdAtMs > startupReconcileCutoffMs) return;
        }
        roomCreatedAt = room.createdAt;

        const liveBeforeReconcile = await getLiveHumanRoomMemberIds(io, redis, roomCode, sessions.get(roomCode));
        await markAllMembersDisconnected(redis, roomCode, uid => liveBeforeReconcile.has(uid));

        // The lifecycle lock is process-local; recheck room identity before
        // applying startup state after another server instance may have acted.
        const currentRoom = await getRoom(redis, roomCode);
        if (!currentRoom || currentRoom.createdAt !== roomCreatedAt) return;

        if (currentRoom.status !== 'waiting') {
          try {
            const savedState = await loadGameState(redis, roomCode);
            if (savedState) {
              await reconcileRoomRosterFromGameState(redis, roomCode, savedState, {
                isHumanLive: userId => liveBeforeReconcile.has(userId),
              });
            }
          } catch (error) {
            if (!isCorruptRestoreError(error)) throw error;
            console.error(`[startup] Corrupt snapshot roster in ${roomCode}:`, error);
            await dissolveRoomUnlocked(
              io,
              redis,
              roomCode,
              sessions,
              turnTimer,
              persister,
              'empty',
              voiceChannels,
              stopAutoPlayForRoom,
            );
            return;
          }
        }

        const session = sessions.get(roomCode);
        const [seats, humanMemberIds, liveHumanIds, departedMemberIds] = await Promise.all([
          getRoomSeats(redis, roomCode),
          getHumanRoomMemberIds(redis, roomCode, session),
          getLiveHumanRoomMemberIds(io, redis, roomCode, session),
          getDepartedMemberIds(redis, roomCode),
        ]);
        if (humanMemberIds.size === 0 || [...humanMemberIds].every(userId => departedMemberIds.has(userId))) {
          await dissolveRoomUnlocked(
            io,
            redis,
            roomCode,
            sessions,
            turnTimer,
            persister,
            'empty',
            voiceChannels,
            stopAutoPlayForRoom,
          );
          return;
        }

        if (currentRoom.status === 'waiting' && !session) {
          for (const seat of seats) {
            if (seat && !seat.isBot && !seat.connected) {
              await scheduleWaitingMemberEviction(roomCode, seat.userId);
            }
          }
        }
        if (liveHumanIds.size === 0) armAllDisconnectTimer(roomCode);
      });
    } catch (error) {
      if (attempt >= STARTUP_RECONCILE_MAX_ATTEMPTS) {
        console.error(`[startup] Failed to reconcile room ${roomCode} after ${attempt} attempts:`, error);
        return;
      }
      console.error(
        `[startup] Failed to reconcile room ${roomCode}; retry ${attempt + 1}/${STARTUP_RECONCILE_MAX_ATTEMPTS}:`,
        error,
      );
      scheduleStartupReconcileRetry(roomCode, roomCreatedAt, attempt + 1);
    }
  }

  // A fresh process has no sockets, so every connected:true flag left in kv
  // by the previous process is a ghost, eligible for owner transfers, and
  // counted as "humans present" when deciding whether rooms live or die.
  // Reset them all; rejoins flip them back. Users who reconnect while this pass runs are
  // protected via the live-socket check.
  async function reconcileStartupRooms(attempt = 1): Promise<void> {
    if (closing) return;
    try {
      const roomCodes = await getRoomCodes();
      for (const roomCode of roomCodes) {
        if (closing) return;
        await reconcileStartupRoom(roomCode);
      }
    } catch (error) {
      if (attempt >= STARTUP_RECONCILE_MAX_ATTEMPTS) {
        console.error(`[startup] Failed to list rooms after ${attempt} attempts:`, error);
        return;
      }
      console.error(`[startup] Failed to list rooms; retry ${attempt + 1}/${STARTUP_RECONCILE_MAX_ATTEMPTS}:`, error);
      const retryTimer = setTimeout(() => {
        void trackOperation(reconcileStartupRooms(attempt + 1));
      }, STARTUP_RECONCILE_RETRY_MS);
      retryTimer.unref?.();
    }
  }

  void trackOperation(reconcileStartupRooms());

  const idleCleanupInterval = setInterval(() => {
    if (closing) return;
    void trackOperation(cleanupIdleRooms()).catch(error => {
      console.error('[idleCleanup] Failed to sweep idle rooms:', error);
    });
  }, ROOM_IDLE_SWEEP_MS);
  idleCleanupInterval.unref?.();

  io.on('connection', socket => {
    const operation = trackOperation(
      (async () => {
        trackSocketListeners(socket);
        const userId = socket.data.user.userId;
        await socket.join(`user:${userId}`);

        socket.emit('server:version', { protocolVersion: PROTOCOL_VERSION, serverTime: Date.now() });

        socket.on('ping:latency', callback => callback());

        if (!socket.data.roomCode) {
          const initialRooms = trackOperation(
            getActiveRooms(redis, io).then(rooms => socket.emit('lobby:rooms', rooms)),
          );
          void initialRooms.catch(error => {
            console.warn('[lobby] Failed to send initial room list:', error);
          });
        }

        // Multi-tab: kick existing connection for same user
        const existingSocketId = userSocketMap.get(userId);
        if (existingSocketId && existingSocketId !== socket.id) {
          const existingSocket = io.sockets.sockets.get(existingSocketId);
          if (existingSocket) {
            existingSocket.emit('auth:kicked', { reason: '已在其他地方登录' });
            existingSocket.disconnect(true);
          }
        }
        userSocketMap.set(userId, socket.id);

        // NOTE: pending disconnect-cleanup timers are deliberately NOT cancelled
        // here. A bare reconnection says nothing about which room the user is
        // returning to — cancelling used to orphan seats when the user went
        // elsewhere. room:rejoin cancels the timer once the user is back in the
        // room the timer belongs to.

        socket.on('user:current_room', async callback => {
          const roomCode = await getUserRoom(redis, userId);
          if (!roomCode) return callback({ roomCode: null });
          const room = await getRoom(redis, roomCode);
          if (!room) {
            await clearUserRoomIfMatches(redis, userId, roomCode);
            return callback({ roomCode: null });
          }
          callback({ roomCode });
        });

        // Handle reconnection: restore room and game state
        socket.on('room:rejoin', async (roomCode: string, callback) => {
          if (!isRoomCode(roomCode)) {
            return callback?.({ success: false, error: '房间码无效' });
          }
          return withUserMembershipLock(userId, () =>
            withRoomLifecycleLock(roomCode, async () => {
              const room = await getRoom(redis, roomCode);
              if (!room) {
                // Only drop the reverse mapping if it actually points at this dead
                // room — rejoining a stale URL must not damage the user's real room.
                if ((await getUserRoom(redis, userId)) === roomCode) {
                  await clearUserRoomIfMatches(redis, userId, roomCode);
                }
                return callback?.({ success: false, error: 'Room not found' });
              }

              // rejoin doubles as the "enter room by URL" path (browser back, pasted
              // links, multi-tab). Never let it silently pull a user out of a room
              // they are still part of.
              const conflict = await ensureNotInRoom(redis, userId, roomCode);
              if (conflict) return callback?.({ success: false, error: conflict });

              let session = sessions.get(roomCode);
              if (!session) {
                let savedState: Awaited<ReturnType<typeof loadGameStateForRestore>> = null;
                try {
                  savedState = room.status === 'waiting' ? null : await loadGameStateForRestore(redis, roomCode);
                } catch (error) {
                  console.error(`[restore] Failed to load game state for ${roomCode}:`, error);
                  if (!isCorruptRestoreError(error)) {
                    return callback?.({ success: false, error: '游戏状态恢复失败，请重试' });
                  }
                  await dissolveRoomUnlocked(
                    io,
                    redis,
                    roomCode,
                    sessions,
                    turnTimer,
                    persister,
                    'empty',
                    voiceChannels,
                    stopAutoPlayForRoom,
                  );
                  return callback?.({ success: false, error: '游戏状态已损坏，房间已清理' });
                }
                // Another rejoin may have restored the session during the kv await —
                // restoring twice would clobber its already-updated player flags.
                session = sessions.get(roomCode);
                if (!session && savedState) {
                  try {
                    try {
                      session = GameSession.fromState(savedState);
                      // The snapshot froze connected flags from a process whose sockets
                      // are all dead. A ghost connected:true player can never disconnect
                      // and never auto-votes — round_end would deadlock waiting for a
                      // click that can't come. Everyone re-earns connected via rejoin.
                      for (const p of session.getFullState().players) {
                        if (!p.isBot) session.setPlayerConnected(p.id, false);
                      }
                    } catch (error) {
                      if (error instanceof GameStateCorruptionError) throw error;
                      throw new GameStateCorruptionError('Persisted game state could not construct a session');
                    }
                    await reconcileRoomRosterFromGameState(redis, roomCode, session.getFullState(), {
                      forceHumansDisconnected: true,
                    });
                  } catch (error) {
                    console.error(`[restore] Failed to reconcile roster for ${roomCode}:`, error);
                    if (!isCorruptRestoreError(error)) {
                      return callback?.({ success: false, error: '游戏状态恢复失败，请重试' });
                    }
                    await dissolveRoomUnlocked(
                      io,
                      redis,
                      roomCode,
                      sessions,
                      turnTimer,
                      persister,
                      'empty',
                      voiceChannels,
                      stopAutoPlayForRoom,
                    );
                    return callback?.({ success: false, error: '游戏状态已损坏，房间已清理' });
                  }
                  sessions.set(roomCode, session);
                  for (const player of session.getFullState().players) {
                    if (!player.isBot && !player.connected) {
                      scheduleActivePlayerGovernance(roomCode, player.id);
                    }
                  }
                  // A session restored after a server restart lost its in-memory
                  // round_end auto-votes — without reseeding they deadlock the vote
                  // (and game_over snapshots need their replay anchor back).
                  reseedTerminalVotes(io, roomCode, session);
                  // No timers survived the restart either: without a driver a
                  // restored game freezes whenever the snapshot's current actor is
                  // offline (or a bot, when only spectators return). startTurnTimer
                  // dispatches bot/autopilot/human phases itself and stops on
                  // terminal ones.
                  ensureTurnDriver(io, redis, roomCode, session, turnTimer, sessions, persister);
                  // The blitz total-time deadline is recoverable from gameStartedAt;
                  // without this a restored blitz game silently becomes untimed.
                  rearmBlitzAfterRestore(io, redis, roomCode, session, sessions, turnTimer, persister);
                  // All players start disconnected — bound the room's zombie
                  // lifetime now instead of waiting 2h for the idle sweep. The
                  // first player rejoin below cancels this.
                  armAllDisconnectTimer(roomCode);
                  // Terminal snapshots gate every exit (next round, back to room) on
                  // the owner — who may never return. The reseeded anchor also
                  // short-circuits emitTerminalStateIfNeeded, so the live path's
                  // owner check would never run again: schedule the transfer here.
                  // The owner's own rejoin (below) cancels it.
                  if (session.isRoundEnd() || session.isGameOver()) {
                    await checkOwnerDisconnectedAtTerminal(roomCode, session);
                  }
                }
              }

              if (!session && room.status !== 'waiting') {
                // A non-waiting room without either a live session or a durable
                // snapshot cannot be resumed safely. Treating it as a waiting room
                // would admit players into a ghost lobby while their cards and turn
                // state are already gone. Tear down every membership through the
                // unified lifecycle path instead.
                await dissolveRoomUnlocked(
                  io,
                  redis,
                  roomCode,
                  sessions,
                  turnTimer,
                  persister,
                  'empty',
                  voiceChannels,
                  stopAutoPlayForRoom,
                );
                return callback?.({ success: false, error: '游戏状态已失效，房间已清理' });
              }

              if (session) {
                const isPlayerInGame = session.getFullState().players.some(p => p.id === userId);

                if (!isPlayerInGame) {
                  // User is not a player — rejoin as spectator. Members already on the
                  // spectator list may always come back (allowSpectators only gates
                  // outsiders), and 'finished' counts as spectatable — the game-over
                  // scoreboard is still part of the session.
                  const existingSpectators = await getRoomSpectators(redis, roomCode);
                  const existingSpectator = existingSpectators.find(s => s.userId === userId);
                  const wasSpectator = existingSpectator !== undefined;
                  const statusAllowsSpectate = room.status === 'playing' || room.status === 'finished';
                  if (!wasSpectator && !(statusAllowsSpectate && room.settings.allowSpectators)) {
                    // The user has no way back into this room; release the reverse
                    // mapping or the lobby keeps bouncing them into this dead end.
                    if ((await getUserRoom(redis, userId)) === roomCode) {
                      await clearUserRoomIfMatches(redis, userId, roomCode);
                    }
                    return callback?.({ success: false, error: '无法观战该房间' });
                  }
                  const [seatsBeforeRejoin, departedBeforeRejoin, mappedRoomBeforeRejoin] = await Promise.all([
                    getRoomSeats(redis, roomCode),
                    getDepartedMemberIds(redis, roomCode),
                    getUserRoom(redis, userId),
                  ]);
                  let latestSeats = seatsBeforeRejoin;
                  let latestSpectators = existingSpectators;
                  try {
                    const roster = await addSpectatorWithMembership(redis, roomCode, {
                      ...(existingSpectator ?? {}),
                      userId: socket.data.user.userId,
                      nickname: socket.data.user.nickname,
                      avatarUrl: socket.data.user.avatarUrl,
                      role: socket.data.user.role,
                      connected: true,
                    });
                    latestSeats = roster.seats;
                    latestSpectators = roster.spectators;
                    await joinRoomSocket(redis, socket, roomCode, { asSpectator: true });
                    await clearMemberDeparted(redis, roomCode, userId);
                  } catch (error) {
                    // Roster + reverse membership is the durable half of a spectator
                    // rejoin; adapter/data is only its live projection. Restore both
                    // sides if any later write fails so a retry starts from the exact
                    // pre-rejoin membership instead of a connected ghost spectator.
                    try {
                      if (wasSpectator) {
                        await setRoomRoster(redis, roomCode, seatsBeforeRejoin, existingSpectators);
                      } else {
                        await removeMemberWithMembership(redis, roomCode, userId);
                      }
                      await restoreDepartureMarker(roomCode, userId, departedBeforeRejoin.has(userId));
                      await leaveRoomSocket(redis, socket, roomCode, {
                        preserveMembership: wasSpectator && mappedRoomBeforeRejoin === roomCode,
                      });
                    } catch (rollbackError) {
                      console.error(`[rejoin] Failed to roll back spectator ${userId} in ${roomCode}:`, rollbackError);
                    }
                    console.error(`[rejoin] Failed to commit spectator ${userId} in ${roomCode}:`, error);
                    return callback?.({ success: false, error: '重连失败，请重试' });
                  }
                  await onRoomMemberReconnected(roomCode, userId, { departureAlreadyCleared: true }).catch(error => {
                    // Governance callbacks re-check durable/socket liveness before
                    // acting, so a post-commit cleanup failure must not undo a valid
                    // membership or turn the request into an ambiguous failure.
                    console.error(`[rejoin] Failed to finalize spectator governance in ${roomCode}:`, error);
                  });
                  const spectatorMode = room.settings.spectatorMode;
                  const view = session.getSpectatorView(spectatorMode);
                  callback?.({
                    success: true,
                    gameState: view,
                    seats: latestSeats,
                    spectators: latestSpectators,
                    room,
                    mode: 'spectator',
                  });
                  socket.emit('chat:history', session.getChatHistory());
                  const updatedSpectators = toSpectatorView(latestSpectators);
                  io.to(roomCode).emit('room:spectator_list', { spectators: updatedSpectators });
                  socket.to(roomCode).emit('room:spectator_joined', {
                    nickname: socket.data.user.nickname,
                    spectators: updatedSpectators,
                  });
                  const queue = getPendingSpectatorQueue(roomCode);
                  // Queue intent is part of the current snapshot lifecycle. Replay the
                  // restored projection so reconnecting clients see the authoritative queue.
                  socket.emit('game:spectator_queue', { queue });
                  const voteState = getRoundEndVoteState(roomCode, session);
                  if (voteState) socket.emit('game:next_round_vote', voteState);
                  replayTerminalEvent(socket, roomCode, session);
                  await broadcastLobbyRooms(redis, io);
                  return;
                }

                const [seatsBeforeRejoin, spectatorsBeforeRejoin, departedBeforeRejoin, mappedRoomBeforeRejoin] =
                  await Promise.all([
                    getRoomSeats(redis, roomCode),
                    getRoomSpectators(redis, roomCode),
                    getDepartedMemberIds(redis, roomCode),
                    getUserRoom(redis, userId),
                  ]);
                const stateBeforeRejoin = structuredClone(session.getFullState());
                const playerBeforeRejoin = stateBeforeRejoin.players.find(player => player.id === userId)!;
                const seatIndex = seatsBeforeRejoin.findIndex(seat => seat?.userId === userId);
                let seatsAfterRejoin = seatsBeforeRejoin.map(seat => {
                  if (!seat || seat.userId !== userId) return seat;
                  return { ...seat, connected: true };
                });

                try {
                  if (seatIndex === -1) throw new Error(`Missing active seat for ${userId}`);
                  await joinRoomSocket(redis, socket, roomCode);
                  session.setPlayerConnected(userId, true);
                  session.setPlayerAutopilot(userId, false);
                  const roster = await setSeatConnectionAndDeparture(redis, roomCode, userId, true, false);
                  seatsAfterRejoin = roster.seats;
                  persister.markDirty(roomCode, session.getFullState());
                  await persister.flushNow(roomCode);
                } catch (error) {
                  // Snapshot, roster and socket membership form one logical rejoin.
                  // Restore every layer independently so a one-shot backend fault
                  // cannot strand a connected session player without an adapter room,
                  // or an adapter member whose durable state is still disconnected.
                  session.setPlayerConnected(userId, playerBeforeRejoin.connected);
                  session.setPlayerAutopilot(userId, playerBeforeRejoin.autopilot);
                  const rollbackErrors: unknown[] = [];
                  const attemptRollback = async (operation: () => Promise<void>) => {
                    try {
                      await operation();
                    } catch (rollbackError) {
                      rollbackErrors.push(rollbackError);
                    }
                  };
                  await attemptRollback(async () => {
                    persister.markDirty(roomCode, stateBeforeRejoin);
                    await persister.flushNow(roomCode);
                  });
                  await attemptRollback(async () => {
                    await setSeatConnectionAndDeparture(
                      redis,
                      roomCode,
                      userId,
                      playerBeforeRejoin.connected,
                      departedBeforeRejoin.has(userId),
                    );
                  });
                  await attemptRollback(() =>
                    leaveRoomSocket(redis, socket, roomCode, {
                      preserveMembership: mappedRoomBeforeRejoin === roomCode,
                    }),
                  );
                  if (rollbackErrors.length > 0) {
                    console.error(
                      `[rejoin] Failed to fully roll back player ${userId} in ${roomCode}:`,
                      rollbackErrors,
                    );
                  }
                  console.error(`[rejoin] Failed to commit player ${userId} in ${roomCode}:`, error);
                  return callback?.({ success: false, error: '重连失败，请重试' });
                }

                await onRoomMemberReconnected(roomCode, userId, { departureAlreadyCleared: true }).catch(error => {
                  console.error(`[rejoin] Failed to finalize player governance in ${roomCode}:`, error);
                });
                stopAutoPlay(userId);
                resetPlayerTimeout(roomCode, userId);
                // Their disconnect earned them an auto-vote; now that they're back
                // the justification is gone — the next round needs their own click.
                if (session.isRoundEnd()) {
                  removePlayerVote(roomCode, userId, session, io);
                }
                await emitGameUpdate(io, roomCode, session, redis).catch(error => {
                  console.error(`[rejoin] Failed to broadcast player state in ${roomCode}:`, error);
                });
                io.to(roomCode).emit('player:reconnected', { playerId: userId });
                io.to(roomCode).emit('player:autopilot', { playerId: userId, enabled: false });
                const seats = seatsAfterRejoin;
                const spectators = spectatorsBeforeRejoin;
                callback?.({
                  success: true,
                  gameState: session.getPlayerView(userId),
                  seats,
                  spectators,
                  room,
                  mode: 'player',
                });
                socket.emit('chat:history', session.getChatHistory());
                socket.emit('room:spectator_list', { spectators: toSpectatorView(spectators) });
                // Same replay the spectator branch does — without it a refreshing
                // player loses the "join next round" badges until the queue changes.
                const pendingQueue = getPendingSpectatorQueue(roomCode);
                socket.emit('game:spectator_queue', { queue: pendingQueue });
                const voteState = getRoundEndVoteState(roomCode, session);
                if (voteState) socket.emit('game:next_round_vote', voteState);
                replayTerminalEvent(socket, roomCode, session);
                // Unconditional: startTurnTimer handles choosing/challenging phases
                // itself and stops for terminal ones. Gating on 'playing' left
                // restored sessions frozen in decision phases; gating on
                // connectedCount >= 2 froze human-vs-human games whose restored
                // snapshot pointed at an offline player — offline turns are driven
                // by the timer's own autopilot/timeout machinery, same as when the
                // disconnect happens live.
                ensureTurnDriver(io, redis, roomCode, session, turnTimer, sessions, persister);
              } else {
                const [seats, spectators, mappedRoomBefore, departedBefore] = await Promise.all([
                  getRoomSeats(redis, roomCode),
                  getRoomSpectators(redis, roomCode),
                  getUserRoom(redis, userId),
                  getDepartedMemberIds(redis, roomCode),
                ]);
                const isSeated = seats.some(s => s !== null && s.userId === userId);
                const existingSpectator = spectators.find(s => s.userId === userId);
                const isSpectator = existingSpectator !== undefined;
                let addedMembership = false;
                let committedSeats = seats;
                let committedSpectators = spectators;

                try {
                  if (!isSeated && !isSpectator) {
                    // New waiting-room membership is durable before adapter
                    // projection, and roster + reverse mapping share one batch.
                    const roster = await addSpectatorWithMembership(redis, roomCode, {
                      userId,
                      nickname: socket.data.user.nickname,
                      avatarUrl: socket.data.user.avatarUrl,
                      role: socket.data.user.role,
                      connected: true,
                    });
                    committedSeats = roster.seats;
                    committedSpectators = roster.spectators;
                    addedMembership = true;
                    await joinRoomSocket(redis, socket, roomCode, { asSpectator: true });
                  } else {
                    // Existing membership remains authoritative if adapter join
                    // fails, so project the socket before changing connected flags.
                    await joinRoomSocket(redis, socket, roomCode, { asSpectator: !isSeated });
                    if (isSeated) {
                      const roster = await setSeatConnectionAndDeparture(redis, roomCode, userId, true, false);
                      committedSeats = roster.seats;
                      committedSpectators = roster.spectators;
                    } else {
                      const roster = await addSpectatorWithMembership(redis, roomCode, {
                        ...existingSpectator!,
                        connected: true,
                      });
                      committedSeats = roster.seats;
                      committedSpectators = roster.spectators;
                    }
                  }

                  if (!isSeated) await clearMemberDeparted(redis, roomCode, userId);
                } catch (error) {
                  if (addedMembership) {
                    await removeMemberWithMembership(redis, roomCode, userId).catch(rollbackError => {
                      console.error(`[rejoin] Failed to remove new waiting membership in ${roomCode}:`, rollbackError);
                    });
                    await restoreDepartureMarker(roomCode, userId, departedBefore.has(userId)).catch(rollbackError => {
                      console.error(`[rejoin] Failed to restore departure state in ${roomCode}:`, rollbackError);
                    });
                  } else {
                    await setRoomRoster(redis, roomCode, seats, spectators).catch(rollbackError => {
                      console.error(`[rejoin] Failed to restore waiting roster in ${roomCode}:`, rollbackError);
                    });
                    await restoreDepartureMarker(roomCode, userId, departedBefore.has(userId)).catch(rollbackError => {
                      console.error(`[rejoin] Failed to restore departure state in ${roomCode}:`, rollbackError);
                    });
                    if (mappedRoomBefore)
                      await setUserRoom(redis, userId, mappedRoomBefore).catch(rollbackError => {
                        console.error(`[rejoin] Failed to restore room mapping for ${userId}:`, rollbackError);
                      });
                    else
                      await clearUserRoomIfMatches(redis, userId, roomCode).catch(rollbackError => {
                        console.error(`[rejoin] Failed to clear room mapping for ${userId}:`, rollbackError);
                        return false;
                      });
                  }
                  await leaveRoomSocket(redis, socket, roomCode, { preserveMembership: !addedMembership }).catch(
                    rollbackError => {
                      console.error(`[rejoin] Failed to restore socket state in ${roomCode}:`, rollbackError);
                      socket.data.roomCode = null;
                      socket.data.isSpectator = false;
                    },
                  );
                  if (isSeated) await scheduleWaitingMemberEviction(roomCode, userId);
                  return callback?.({ success: false, error: 'Cannot rejoin room' });
                }

                // Connected roster + cleared departure marker are committed. Timer
                // cancellation and owner projection are governance side effects and
                // cannot make the client believe this successful rejoin failed.
                await onRoomMemberReconnected(roomCode, userId, { departureAlreadyCleared: true }).catch(error => {
                  console.warn(`[rejoin] Failed to finalize waiting governance in ${roomCode}:`, error);
                });

                // Durable membership is committed. Projection reads use the committed
                // roster as fallback and cannot return a false failure to the client.
                const [updatedSeats, updatedSpectators] = await Promise.all([
                  getRoomSeats(redis, roomCode).catch(() => committedSeats),
                  getRoomSpectators(redis, roomCode).catch(() => committedSpectators),
                ]);
                io.to(roomCode).emit('seat:updated', { seats: updatedSeats, spectators: updatedSpectators });
                callback?.({
                  success: true,
                  seats: updatedSeats,
                  spectators: updatedSpectators,
                  room,
                  mode: 'waiting',
                });
              }
            }),
          );
        });

        registerRoomEvents(
          socket,
          io,
          redis,
          roomManager,
          turnTimer,
          sessions,
          persister,
          voiceChannels,
          armAllDisconnectTimer,
          onRoomMemberReconnected,
          stopAutoPlayForRoom,
        );
        registerSeatEvents(socket, io, redis);
        registerGameEvents(socket, io, redis, turnTimer, sessions, persister);
        registerInteractionEvents(socket, io);
        registerVoicePresenceEvents(socket, io, roomCode => voiceChannels.getRoomChannel(roomCode));

        socket.on('player:toggle-autopilot', async callback => {
          const now = Date.now();
          const lastToggle = autopilotToggleTimestamps.get(userId) ?? 0;
          if (now - lastToggle < AUTOPILOT_TOGGLE_COOLDOWN_MS) {
            return callback?.({ success: false, error: '操作太频繁，请稍后再试' });
          }
          autopilotToggleTimestamps.set(userId, now);

          const roomCode = socket.data.roomCode;
          if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
          return withRoomLifecycleLock(roomCode, async () => {
            if (socket.data.roomCode !== roomCode) return callback?.({ success: false, error: '不在房间中' });
            const session = sessions.get(roomCode);
            if (!session) return callback?.({ success: false, error: '游戏未开始' });
            const state = session.getFullState();
            const player = state.players.find(p => p.id === userId);
            if (!player) return callback?.({ success: false, error: '玩家不在游戏中' });

            const nextAutopilot = !player.autopilot;
            session.setPlayerAutopilot(userId, nextAutopilot);
            if (nextAutopilot) {
              // Deliberately NOT auto-voting: a connected human enabling autopilot
              // is delegating card play, not consenting to start the next round.
              startAutoPlay(userId, roomCode);
            } else {
              stopAutoPlay(userId);
              resetPlayerTimeout(roomCode, userId);
            }
            persister.markDirty(roomCode, session.getFullState());
            await emitGameUpdate(io, roomCode, session, redis).catch(error => {
              console.warn(`[autopilot] Failed to broadcast committed toggle in ${roomCode}:`, error);
            });
            io.to(roomCode).emit('player:autopilot', { playerId: userId, enabled: nextAutopilot });
            callback?.({ success: true, autopilot: nextAutopilot });
          });
        });

        socket.on('game:autopilot_once', async callback => {
          const roomCode = socket.data.roomCode;
          if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
          return withRoomLifecycleLock(roomCode, async () => {
            if (socket.data.roomCode !== roomCode) return callback?.({ success: false, error: '不在房间中' });
            const session = sessions.get(roomCode);
            if (!session) return callback?.({ success: false, error: '游戏未开始' });
            const state = session.getFullState();
            const player = state.players.find(p => p.id === userId);
            if (!player) return callback?.({ success: false, error: '玩家不在游戏中' });
            if (player.autopilot) return callback?.({ success: false, error: '已在托管中' });
            if (!canPlayerAutopilotOnce(state, userId)) return callback?.({ success: false, error: '不是你的回合' });

            const acted = await executeAutopilot(
              session,
              userId,
              async () => {
                persister.markDirty(roomCode, session.getFullState());
              },
              async action => {
                notifyAutopilotAction(roomCode, session, action);
                persister.markDirty(roomCode, session.getFullState());
                await emitGameUpdate(io, roomCode, session, redis).catch(error => {
                  console.warn(`[autopilot-once] Post-commit action projection failed in ${roomCode}:`, error);
                });
              },
              () => sessions.get(roomCode) === session,
            );

            if (sessions.get(roomCode) !== session) return callback?.({ success: false, error: '游戏已结束' });
            if (acted) {
              await driveCommittedActionPostcommit(io, redis, roomCode, session, turnTimer, sessions, persister, {
                lockHeld: true,
                touchActivity: false,
                emitUpdate: false,
                startNextTurn: true,
                context: 'autopilot-once',
              });
            }
            callback?.({ success: true });
          });
        });

        socket.on('disconnect', async () => {
          clearRateLimit(socket.id);
          clearThrowTimestamp(userId);
          clearChatTimestamps(userId);
          autopilotToggleTimestamps.delete(userId);
          if (userSocketMap.get(userId) === socket.id) {
            userSocketMap.delete(userId);
          }
          const roomCode = socket.data.roomCode;
          if (!roomCode) return;
          try {
            await withRoomLifecycleLock(roomCode, async () => {
              if (socket.data.roomCode !== roomCode) return;

              removeVoicePresenceForSocket(io, roomCode, userId, socket.id);

              // Multi-tab takeover: the superseded socket may finish disconnecting
              // after the replacement has already rejoined this adapter room. In
              // that case the user is still live and the old socket must not flip
              // their shared player/spectator state back to disconnected.
              let replacementSockets: Awaited<ReturnType<ReturnType<typeof io.in>['fetchSockets']>> = [];
              try {
                replacementSockets = await io.in(roomCode).fetchSockets();
              } catch (error) {
                // A registered replacement is stronger evidence than a transient
                // adapter read failure; never disconnect its shared player state.
                const replacementSocketId = userSocketMap.get(userId);
                if (replacementSocketId && replacementSocketId !== socket.id) return;
                console.warn(`[disconnect] Failed to inspect replacement sockets in ${roomCode}:`, error);
              }
              if (
                replacementSockets.some(
                  candidate => candidate.id !== socket.id && candidate.data.user.userId === userId,
                )
              )
                return;

              const currentSession = sessions.get(roomCode);
              // Session membership wins for active players; every other disconnect
              // is classified from the authoritative spectator roster.
              const isCurrentPlayer =
                currentSession?.getFullState().players.some(player => player.id === userId) ?? false;
              const currentSpectators = isCurrentPlayer ? [] : await getRoomSpectators(redis, roomCode);
              const isCurrentSpectator =
                !isCurrentPlayer && currentSpectators.some(spectator => spectator.userId === userId);

              if (isCurrentSpectator) {
                await setSpectatorConnected(redis, roomCode, userId, false);

                // Governance must not depend on roster/lobby projection reads.
                const room = await getRoom(redis, roomCode).catch(error => {
                  console.warn(`[disconnect] Failed to read room governance in ${roomCode}:`, error);
                  return null;
                });
                const terminal = currentSession?.isRoundEnd() || currentSession?.isGameOver();
                if (room?.ownerId === userId && (currentSession ? terminal : room?.status === 'waiting')) {
                  scheduleOwnerTransfer(roomCode, userId);
                }
                try {
                  const liveHumanIds = await getLiveHumanRoomMemberIds(io, redis, roomCode, currentSession);
                  if (liveHumanIds.size === 0) armAllDisconnectTimer(roomCode);
                } catch (error) {
                  console.warn(`[disconnect] Failed to inspect live spectators in ${roomCode}:`, error);
                  armAllDisconnectTimer(roomCode);
                }

                const disconnectedProjection = currentSpectators.map(spectator =>
                  spectator.userId === userId ? { ...spectator, connected: false } : spectator,
                );
                const [dcSeats, dcSpectators] = await Promise.all([
                  getRoomSeats(redis, roomCode).catch(() => null),
                  getRoomSpectators(redis, roomCode).catch(() => disconnectedProjection),
                ]);
                if (dcSeats) io.to(roomCode).emit('seat:updated', { seats: dcSeats, spectators: dcSpectators });
                io.to(roomCode).emit('room:spectator_list', { spectators: toSpectatorView(dcSpectators) });
                await broadcastLobbyRooms(redis, io).catch(error => {
                  console.warn(`[disconnect] Failed to refresh spectator lobby in ${roomCode}:`, error);
                });
                return;
              }

              const session = currentSession;
              if (session) {
                // Keep the seat's connected flag in sync — owner transfer picks the
                // next owner from seats, and a stale `connected: true` hands the room
                // to someone who is gone.
                await setSeatPlayerConnected(redis, roomCode, userId, false);
                session.setPlayerConnected(userId, false);
                persister.markDirty(roomCode, session.getFullState());
                await persister.flushNow(roomCode).catch(error => {
                  console.warn(`[disconnect] Snapshot write deferred in ${roomCode}:`, error);
                });

                if (session.isRoundEnd()) {
                  try {
                    addAutopilotVote(roomCode, userId, session, io);
                  } catch (error) {
                    console.warn(`[disconnect] Failed to seed terminal auto-vote in ${roomCode}:`, error);
                  }
                }

                const state = session.getFullState();
                const connectedCount = state.players.filter(p => p.connected).length;
                if (connectedCount < 2) {
                  turnTimer.stop(roomCode);
                }
                try {
                  const liveHumanIds = await getLiveHumanRoomMemberIds(io, redis, roomCode, session);
                  if (liveHumanIds.size === 0) armAllDisconnectTimer(roomCode);
                } catch (error) {
                  console.warn(`[disconnect] Failed to inspect live players in ${roomCode}:`, error);
                  armAllDisconnectTimer(roomCode);
                }

                const room = await getRoom(redis, roomCode).catch(error => {
                  console.warn(`[disconnect] Failed to inspect owner governance in ${roomCode}:`, error);
                  return null;
                });
                if (room && room.ownerId === userId) {
                  const phase = state.phase;
                  if (phase === 'round_end' || phase === 'game_over') {
                    scheduleOwnerTransfer(roomCode, userId);
                  }
                }

                // Start the 30s reconnect window, then enable autopilot.
                scheduleActivePlayerGovernance(roomCode, userId);

                await emitGameUpdate(io, roomCode, session, redis).catch(error => {
                  console.warn(`[disconnect] Failed to broadcast player disconnect in ${roomCode}:`, error);
                });
                io.to(roomCode).emit('player:disconnected', { playerId: userId });
              } else {
                // Mark player as disconnected in seat (also cancels ready)
                await setSeatPlayerConnected(redis, roomCode, userId, false);
                clearUserSwapRequests(roomCode, userId);

                // Start reconnect governance before any fallible projection reads.
                await scheduleWaitingMemberEviction(roomCode, userId);
                const [disconnectSeats, disconnectSpectators] = await Promise.all([
                  getRoomSeats(redis, roomCode).catch(() => null),
                  getRoomSpectators(redis, roomCode).catch(() => null),
                ]);
                if (disconnectSeats && disconnectSpectators) {
                  io.to(roomCode).emit('seat:updated', { seats: disconnectSeats, spectators: disconnectSpectators });
                }
              }
            });
          } catch (error) {
            console.error(`[disconnect] Failed to commit disconnect for ${userId} in ${roomCode}:`, error);
          }
        });
      })(),
    );
    void operation.catch(error => {
      console.error('[socket] Failed to initialize connection:', error);
      socket.disconnect(true);
    });
    return operation;
  });

  function beginShutdown(): void {
    closing = true;
    turnTimer.stopAll();
    clearInterval(idleCleanupInterval);
    for (const entry of autoPlayIntervals.values()) clearInterval(entry.timer);
    autoPlayIntervals.clear();
    for (const entry of disconnectTimers.values()) clearTimeout(entry.timer);
    disconnectTimers.clear();
    for (const timer of allDisconnectTimers.values()) clearTimeout(timer);
    allDisconnectTimers.clear();
    for (const entry of startupReconcileTimers.values()) clearTimeout(entry.timer);
    startupReconcileTimers.clear();
    clearAllRoomEventTimers();
    clearAllGameEventTimers();
    clearAllSeatSwapState();
    cancelAllOwnerTransfers();
  }

  async function drain(): Promise<void> {
    await drainActiveOperations();
    await Promise.all([drainRoomLifecycleLocks(), drainUserMembershipLocks()]);
    await drainActiveOperations();
    // Disconnect and post-commit work can arm delayed governance after the
    // first cancellation pass. Clear it again only after all admitted work is done.
    beginShutdown();
    await Promise.all([drainRoomLifecycleLocks(), drainUserMembershipLocks()]);
    await drainActiveOperations();
  }

  return {
    roomManager,
    turnTimer,
    sessions,
    persister,
    voiceChannels,
    cleanupIdleRooms,
    cleanupRoomRuntime: stopAutoPlayForRoom,
    beginShutdown,
    drain,
  };
}

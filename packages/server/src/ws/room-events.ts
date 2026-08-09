import type { UnoSocket as Socket, UnoServer as SocketIOServer } from './types.js';
import type { KvStore } from '../kv/types.js';
import type {
  AiProviderInfo,
  BotConfig,
  BotSelection,
  GameAction,
  GameState,
  HouseRules,
  RoomSettingsPatch,
  RuleBotDifficulty,
} from '@uno-online/shared';
import {
  MIN_PLAYERS,
  SEAT_COUNT,
  DEFAULT_HOUSE_RULES,
  applyRoomSettingsPatch,
  isCurrentRoomSettingsPatch,
  automationStateFingerprint,
  chooseAutopilotAction,
  chooseJumpInAction,
  chooseBotAction,
  getPlayableCards,
  DIFFICULTY_PARAMS,
  RULE_BOT_DIFFICULTIES,
} from '@uno-online/shared';
import { RoomManager } from '../plugins/core/room/manager.js';
import {
  getRoom,
  getRoomSeats,
  getRoomSpectators,
  setRoomSettings,
  setRoomStatus,
  touchRoomActivity,
  ensureNotInRoom,
  getSeatedPlayers,
  setSpectatorConnected,
  setRoomOwnerIfMatches,
  addSpectatorWithMembership,
  removeMemberWithMembership,
  setSeatConnectionAndDeparture,
} from '../plugins/core/room/store.js';
import { joinRoomSocket, leaveRoomSocket } from './socket-room.js';
import { GameSession } from '../plugins/core/game/session.js';
import { deleteGameState, type GameStatePersister } from '../plugins/core/game/state-store.js';
import type { TurnTimer } from '../plugins/core/game/turn-timer.js';
import type { VoiceChannelManager } from '../voice/channel-manager.js';
import {
  removePlayerVote,
  emitTerminalStateIfNeeded,
  emitTerminalStateIfNeededUnlocked,
  driveCommittedActionPostcommit,
  addAutopilotVote,
  getPendingSpectatorQueue,
  removePendingSpectatorJoin,
} from './game-events.js';
import { cancelOwnerTransfer, scheduleOwnerTransfer, transferOwnerToLiveMemberUnlocked } from './owner-transfer.js';
import { dissolveRoom, dissolveRoomUnlocked } from './room-lifecycle.js';
import { removeVoicePresence, setForceMuted } from './voice-presence.js';
import { broadcastLobbyRooms } from '../plugins/core/spectate/routes.js';
import { getAutopilotActionPlayerId } from './autopilot-action-player.js';
import { broadcastSpectatorLeft, broadcastSpectatorList } from '../plugins/core/spectate/ws.js';
import { addBot, removeBot, setBotDifficulty, setBotAi, calculateBotDelay } from './bot-manager.js';
import { chooseBotActionWithAi } from '../ai/rl-onnx.js';
import { aiProviderRegistry, type AiProviderSummary } from '../ai/model-registry.js';
import { enabledHouseRuleNames, providerSupportsContext } from '../ai/provider.js';
import { checkBotUnoCatch, checkBotJumpIn, clearAllBotTimers, clearBotTimers } from './bot-uno-watcher.js';
import { withRoomLifecycleLock } from './room-lifecycle-lock.js';
import { getHumanRoomMemberIds, getLiveHumanRoomMemberIds } from './room-membership.js';
import { isNextRoundExcluded } from '../plugins/core/game/lifecycle-state.js';
import { withUserMembershipLock } from './user-membership-lock.js';
import { clearMemberDeparted, getDepartedMemberIds, markMemberDeparted } from './room-departure.js';
import { hasExactKeys, isNonEmptyString, isRoomCode } from './payload-validation.js';

const AUTOPILOT_MIN_ACTION_INTERVAL_MS = 500;
const AUTO_AUTOPILOT_THRESHOLD = 2;
type AutopilotActionHandler = (roomCode: string, session: GameSession, action: GameAction) => void;
type AiProviderListIntent = 'add' | 'switch';

// Track consecutive timeouts per player per room
const timeoutCounts = new Map<string, Map<string, number>>();
const blitzTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Absolute deadline (ms epoch) per blitz game. Survives the timer itself so
// a deadline that lands on the round_end scoreboard can still be enforced
// when the next round is about to start.
const blitzDeadlines = new Map<string, number>();
// Rooms whose game:start is mid-flight; blocks concurrent starts.
const startingRooms = new Set<string>();
const botTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
let autopilotActionHandler: AutopilotActionHandler | null = null;

export function filterAiProviderInfos(
  providers: readonly AiProviderSummary[],
  playerCount: number,
  houseRules: HouseRules,
): AiProviderInfo[] {
  const enabledRules = enabledHouseRuleNames(houseRules);
  return providers
    .filter(provider => providerSupportsContext(provider, playerCount, enabledRules))
    .map(provider => ({
      id: provider.id,
      displayName: provider.displayName,
      fairness: provider.fairness,
    }));
}

function sameBotConfig(left: BotConfig | undefined, right: BotConfig | undefined): boolean {
  if (!left || !right) return left === right;
  if (left.difficulty !== right.difficulty || left.personality !== right.personality) return false;
  if (left.difficulty !== 'rl') return true;
  return right.difficulty === 'rl' && left.aiProviderId === right.aiProviderId;
}

export function setAutopilotActionHandler(handler: AutopilotActionHandler | null): void {
  autopilotActionHandler = handler;
}

export function notifyAutopilotAction(roomCode: string, session: GameSession, action: GameAction): void {
  autopilotActionHandler?.(roomCode, session, action);
}

export function resetPlayerTimeout(roomCode: string, playerId: string): void {
  const roomCounts = timeoutCounts.get(roomCode);
  if (roomCounts) roomCounts.delete(playerId);
}

export function clearRoomTimeouts(roomCode: string, opts?: { keepBlitz?: boolean }): void {
  timeoutCounts.delete(roomCode);
  // The blitz clock spans the WHOLE game — a round_end settlement must not
  // consume it, or the total-time limit silently vanishes after round one.
  if (!opts?.keepBlitz) {
    const blitzTimer = blitzTimers.get(roomCode);
    if (blitzTimer) {
      clearTimeout(blitzTimer);
      blitzTimers.delete(roomCode);
    }
    blitzDeadlines.delete(roomCode);
  }
  clearBotTurnTimer(roomCode);
  clearBotTimers(roomCode);
}

function clearBotTurnTimer(roomCode: string): void {
  const timer = botTurnTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    botTurnTimers.delete(roomCode);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getImmediateAutopilotPlayerId(state: GameState): string | null {
  const playerId = getAutopilotActionPlayerId(state);
  if (!playerId) return null;
  return state.players.find(p => p.id === playerId)?.autopilot ? playerId : null;
}

function canAutopilotActForPlayer(session: GameSession, playerId: string): boolean {
  const state = session.getFullState();
  return getAutopilotActionPlayerId(state) === playerId;
}

function remainingHumanTurnSeconds(state: GameState & { turnStartedAt: number }, timeLimitSeconds: number): number {
  const deadline = state.turnStartedAt + timeLimitSeconds * 1000;
  return Math.max(0, deadline - Date.now()) / 1000;
}

export function clearAllRoomEventTimers(): void {
  timeoutCounts.clear();
  for (const timer of blitzTimers.values()) clearTimeout(timer);
  blitzTimers.clear();
  blitzDeadlines.clear();
  startingRooms.clear();
  for (const timer of botTurnTimers.values()) clearTimeout(timer);
  botTurnTimers.clear();
  clearAllBotTimers();
  autopilotActionHandler = null;
}

export function registerRoomEvents(
  socket: Socket,
  io: SocketIOServer,
  redis: KvStore,
  roomManager: RoomManager,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
  voiceChannels: VoiceChannelManager,
  armAllDisconnectTimer: (roomCode: string) => void,
  onRoomMemberReconnected: (
    roomCode: string,
    userId: string,
    options?: { departureAlreadyCleared?: boolean },
  ) => Promise<void>,
  cleanupRoomRuntime: (roomCode: string) => void,
) {
  const data = socket.data;

  async function removePendingSpectatorIntent(roomCode: string, userId: string): Promise<void> {
    if (!removePendingSpectatorJoin(roomCode, userId)) return;
    const session = sessions.get(roomCode);
    if (session) {
      persister.markDirty(roomCode, session.getFullState());
      await persister.flushNow(roomCode);
    }
    io.to(roomCode).emit('game:spectator_queue', {
      queue: getPendingSpectatorQueue(roomCode),
    });
  }

  async function isFinalUndepartedHuman(roomCode: string, userId: string, session?: GameSession): Promise<boolean> {
    const [humanMemberIds, departedMemberIds] = await Promise.all([
      getHumanRoomMemberIds(redis, roomCode, session),
      getDepartedMemberIds(redis, roomCode),
    ]);
    return [...humanMemberIds].every(memberId => memberId === userId || departedMemberIds.has(memberId));
  }

  socket.on('room:create', async (settings: RoomSettingsPatch, callback) => {
    return withUserMembershipLock(data.user.userId, async () => {
      const conflict = await ensureNotInRoom(redis, data.user.userId);
      if (conflict) return callback({ success: false, error: conflict });
      if (!isCurrentRoomSettingsPatch(settings)) {
        return callback({ success: false, error: '房间设置无效' });
      }
      const roomSettings = applyRoomSettingsPatch(
        {
          turnTimeLimit: 30,
          targetScore: 1000,
          houseRules: DEFAULT_HOUSE_RULES,
          allowSpectators: true,
          spectatorMode: 'hidden',
        },
        settings,
      );
      let code: string | null = null;
      try {
        code = await roomManager.createRoom(
          data.user.userId,
          data.user.nickname,
          roomSettings,
          data.user.avatarUrl,
          data.user.role,
        );
        const voiceChannelId = await voiceChannels.ensureRoomChannel(code);
        await joinRoomSocket(redis, socket, code);
        const [room, seats, spectators] = await Promise.all([
          getRoom(redis, code),
          getRoomSeats(redis, code),
          getRoomSpectators(redis, code),
        ]);
        if (!room) throw new Error('Created room is missing from storage');
        callback({ success: true, roomCode: code, seats, spectators, room, voiceChannelId });
        io.to(code).emit('seat:updated', { seats, spectators });
      } catch (error) {
        if (code) {
          await dissolveRoom(
            io,
            redis,
            code,
            sessions,
            turnTimer,
            persister,
            'empty',
            voiceChannels,
            cleanupRoomRuntime,
          ).catch(cleanupError => {
            console.error(`[room:create] Failed to roll back ${code}:`, cleanupError);
          });
        }
        callback({ success: false, error: '创建房间失败，请重试' });
      }
    });
  });

  socket.on('room:join', async (roomCode: string, callback) => {
    if (!isRoomCode(roomCode)) {
      return callback({ success: false, error: '房间码无效' });
    }
    return withUserMembershipLock(data.user.userId, () =>
      withRoomLifecycleLock(roomCode, async () => {
        try {
          const room = await getRoom(redis, roomCode);
          if (!room) return callback({ success: false, error: 'Room not found' });

          const [seats, spectators] = await Promise.all([
            getRoomSeats(redis, roomCode),
            getRoomSpectators(redis, roomCode),
          ]);
          const seatedPlayers = getSeatedPlayers(seats);
          const isExistingSpectator = spectators.some(s => s.userId === data.user.userId);
          const alreadyInRoom = seatedPlayers.some(p => p.userId === data.user.userId) || isExistingSpectator;

          if (alreadyInRoom) {
            if (room.status !== 'waiting') {
              const [voiceChannelId, latestSeats, latestSpectators] = await Promise.all([
                voiceChannels.getRoomChannel(roomCode).catch(() => null),
                getRoomSeats(redis, roomCode).catch(() => seats),
                getRoomSpectators(redis, roomCode).catch(() => spectators),
              ]);
              return callback({
                success: true,
                seats: latestSeats,
                spectators: latestSpectators,
                room,
                rejoin: true,
                voiceChannelId,
              });
            }
            const previousConnected = isExistingSpectator
              ? (spectators.find(item => item.userId === data.user.userId)?.connected ?? false)
              : (seats.find(item => item?.userId === data.user.userId)?.connected ?? false);
            const wasDeparted = (await getDepartedMemberIds(redis, roomCode)).has(data.user.userId);
            let committedSeats = seats;
            let committedSpectators = spectators;
            try {
              await joinRoomSocket(redis, socket, roomCode, { asSpectator: isExistingSpectator });
              if (isExistingSpectator) {
                await setSpectatorConnected(redis, roomCode, data.user.userId, true);
                await clearMemberDeparted(redis, roomCode, data.user.userId);
                committedSpectators = spectators.map(item =>
                  item.userId === data.user.userId ? { ...item, connected: true } : item,
                );
              } else {
                const roster = await setSeatConnectionAndDeparture(redis, roomCode, data.user.userId, true, false);
                committedSeats = roster.seats;
                committedSpectators = roster.spectators;
              }
            } catch (error) {
              if (isExistingSpectator) {
                await setSpectatorConnected(redis, roomCode, data.user.userId, previousConnected).catch(
                  rollbackError => {
                    console.error(`[room:join] Failed to restore spectator state in ${roomCode}:`, rollbackError);
                  },
                );
                if (wasDeparted)
                  await markMemberDeparted(redis, roomCode, data.user.userId).catch(rollbackError => {
                    console.error(`[room:join] Failed to restore departure state in ${roomCode}:`, rollbackError);
                  });
              } else {
                await setSeatConnectionAndDeparture(
                  redis,
                  roomCode,
                  data.user.userId,
                  previousConnected,
                  wasDeparted,
                ).catch(rollbackError => {
                  console.error(`[room:join] Failed to restore seat state in ${roomCode}:`, rollbackError);
                });
              }
              await leaveRoomSocket(redis, socket, roomCode, { preserveMembership: true }).catch(rollbackError => {
                console.error(`[room:join] Failed to restore socket state in ${roomCode}:`, rollbackError);
              });
              throw error;
            }
            await onRoomMemberReconnected(roomCode, data.user.userId, { departureAlreadyCleared: true }).catch(
              error => {
                // Membership is already committed. Governance reconciliation is
                // idempotent and must not turn a valid waiting-room return into an
                // ambiguous failure or undo its adapter membership.
                console.warn(`[room:join] Failed to finalize rejoin governance in ${roomCode}:`, error);
              },
            );
            const [voiceChannelId, latestSeats, latestSpectators] = await Promise.all([
              voiceChannels.getRoomChannel(roomCode).catch(() => null),
              getRoomSeats(redis, roomCode).catch(() => committedSeats),
              getRoomSpectators(redis, roomCode).catch(() => committedSpectators),
            ]);
            return callback({
              success: true,
              seats: latestSeats,
              spectators: latestSpectators,
              room,
              rejoin: false,
              voiceChannelId,
            });
          }

          const conflict = await ensureNotInRoom(redis, data.user.userId, roomCode);
          if (conflict) return callback({ success: false, error: conflict });

          if (room.status !== 'waiting') throw new Error('Game already in progress');
          let joinedRoster: Awaited<ReturnType<typeof addSpectatorWithMembership>>;
          try {
            joinedRoster = await addSpectatorWithMembership(redis, roomCode, {
              userId: data.user.userId,
              nickname: data.user.nickname,
              avatarUrl: data.user.avatarUrl,
              role: data.user.role,
              connected: true,
            });
            await joinRoomSocket(redis, socket, roomCode, { asSpectator: true });
          } catch (error) {
            // The roster and reverse mapping are one durable membership. If the
            // adapter projection fails after that commit, compensate them with
            // the inverse atomic mutation so the caller can safely retry.
            await removeMemberWithMembership(redis, roomCode, data.user.userId).catch(rollbackError => {
              console.error(`[room:join] Failed to roll back membership in ${roomCode}:`, rollbackError);
            });
            await leaveRoomSocket(redis, socket, roomCode).catch(rollbackError => {
              console.error(`[room:join] Failed to detach rolled-back socket from ${roomCode}:`, rollbackError);
            });
            throw error;
          }
          await touchRoomActivity(redis, roomCode).catch(error => {
            console.warn(`[room:join] Failed to touch ${roomCode}:`, error);
          });
          // Membership is already committed. Projection reads and voice metadata
          // must not turn a successful join into a misleading failure response.
          const [voiceChannelId, updatedSeats, updatedSpectators] = await Promise.all([
            voiceChannels.getRoomChannel(roomCode).catch(() => null),
            getRoomSeats(redis, roomCode).catch(() => joinedRoster.seats),
            getRoomSpectators(redis, roomCode).catch(() => joinedRoster.spectators),
          ]);
          callback({
            success: true,
            seats: updatedSeats,
            spectators: updatedSpectators,
            room,
            rejoin: false,
            voiceChannelId,
          });
          io.to(roomCode).emit('seat:updated', { seats: updatedSeats, spectators: updatedSpectators });
        } catch (err) {
          if (!(err instanceof Error)) throw err;
          callback({ success: false, error: err.message });
        }
      }),
    );
  });

  socket.on('room:leave', async callback => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });
    return withUserMembershipLock(data.user.userId, () =>
      withRoomLifecycleLock(roomCode, async () => {
        if (data.roomCode !== roomCode) return callback?.({ success: false, error: '不在房间中' });

        const spectators = await getRoomSpectators(redis, roomCode);
        const isRoomSpectator = spectators.some(s => s.userId === data.user.userId) || data.isSpectator;

        if (isRoomSpectator) {
          const { userId, nickname } = data.user;
          const room = await getRoom(redis, roomCode);
          if (await isFinalUndepartedHuman(roomCode, userId, sessions.get(roomCode))) {
            // Keep roster, mapping and socket intact until the durable room delete
            // commits. A failed delete therefore remains fully retryable.
            try {
              await dissolveRoomUnlocked(
                io,
                redis,
                roomCode,
                sessions,
                turnTimer,
                persister,
                'empty',
                voiceChannels,
                cleanupRoomRuntime,
              );
              return callback?.({ success: true, outcome: 'dissolved' });
            } catch (error) {
              console.error(`[room:leave] Failed to dissolve final spectator room ${roomCode}:`, error);
              return callback?.({ success: false, error: '离开房间失败，请重试' });
            }
          }

          let membership: Awaited<ReturnType<typeof removeMemberWithMembership>>;
          try {
            membership = await removeMemberWithMembership(redis, roomCode, userId);
          } catch (error) {
            console.error(`[room:leave] Failed to remove spectator membership in ${roomCode}:`, error);
            return callback?.({ success: false, error: '离开房间失败，请重试' });
          }

          // Durable membership is the commit boundary. Queue, voice, adapter and
          // broadcasts are projections and cannot turn the operation into a
          // half-failed response.
          await clearMemberDeparted(redis, roomCode, userId).catch(error => {
            console.warn(`[room:leave] Failed to clear departed marker for ${userId}:`, error);
          });
          await removePendingSpectatorIntent(roomCode, userId).catch(error => {
            console.warn(`[room:leave] Failed to clear spectator queue for ${userId}:`, error);
          });
          removeVoicePresence(io, roomCode, userId);
          await leaveRoomSocket(redis, socket, roomCode).catch(error => {
            console.warn(`[room:leave] Failed to detach spectator ${socket.id}:`, error);
            data.roomCode = null;
            data.isSpectator = false;
          });
          if (room?.ownerId === userId) {
            await transferOwnerToLiveMemberUnlocked(roomCode, userId).catch(error => {
              console.warn(`[room:leave] Failed to transfer spectator owner in ${roomCode}:`, error);
              scheduleOwnerTransfer(roomCode, userId);
              return false;
            });
          }
          await broadcastSpectatorLeft(io, redis, roomCode, userId, nickname).catch(error => {
            console.warn(`[room:leave] Failed to broadcast spectator departure in ${roomCode}:`, error);
          });
          io.to(roomCode).emit('seat:updated', {
            seats: membership.seats,
            spectators: membership.spectators,
          });
          await broadcastLobbyRooms(redis, io).catch(error => {
            console.warn(`[room:leave] Failed to refresh lobby for ${roomCode}:`, error);
          });
          return callback?.({ success: true, outcome: 'left' });
        }
        const session = sessions.get(roomCode);

        // During an active game, voluntary leave means immediate disconnect +
        // autopilot. The player entity, cards, seat and reverse room membership
        // remain authoritative until terminal moderation or room dissolution.
        if (session) {
          const stateBeforeLeave = structuredClone(session.getFullState());
          const actionPlayerBeforeLeave = getAutopilotActionPlayerId(stateBeforeLeave);
          const activePlayerBeforeLeave = stateBeforeLeave.players.find(player => player.id === data.user.userId);
          if (!activePlayerBeforeLeave) {
            return callback?.({ success: false, error: '当前用户不在对局玩家列表中' });
          }

          let isFinalHuman: boolean;
          try {
            isFinalHuman = await isFinalUndepartedHuman(roomCode, data.user.userId, session);
          } catch (error) {
            console.error(`[room:leave] Failed to inspect departure membership in ${roomCode}:`, error);
            return callback?.({ success: false, error: '离开对局失败，请重试' });
          }
          if (isFinalHuman) {
            // The durable room deletion itself records the final exit. Do not
            // pre-write a departed marker: if deletion fails the still-online
            // caller remains an ordinary member and can retry without rollback.
            try {
              await dissolveRoomUnlocked(
                io,
                redis,
                roomCode,
                sessions,
                turnTimer,
                persister,
                'empty',
                voiceChannels,
                cleanupRoomRuntime,
              );
              return callback?.({ success: true, outcome: 'dissolved' });
            } catch (error) {
              console.error(`[room:leave] Failed to dissolve final active room ${roomCode}:`, error);
              return callback?.({ success: false, error: '离开对局失败，请重试' });
            }
          }

          session.setPlayerConnected(data.user.userId, false);
          session.setPlayerAutopilot(data.user.userId, true);
          try {
            // Seat connectivity and explicit-departure intent are the durable
            // commit boundary and are published by one batchStrings transaction.
            await setSeatConnectionAndDeparture(redis, roomCode, data.user.userId, false, true);
          } catch (error) {
            console.error(`[room:leave] Failed to suspend ${data.user.userId}; rolling back:`, error);
            // Restore the same GameSession instance in place. Turn/bot timer
            // callbacks capture this identity; replacing it with fromState would
            // make every already-armed driver fail its identity guard and freeze
            // the otherwise live game after a failed leave.
            session.setPlayerConnected(data.user.userId, activePlayerBeforeLeave.connected);
            session.setPlayerAutopilot(data.user.userId, activePlayerBeforeLeave.autopilot);
            return callback?.({ success: false, error: '离开对局失败，请重试' });
          }

          // Persister failures retain the dirty snapshot and schedule retry. The
          // runtime and durable membership are already fully suspended, so a
          // transient snapshot write cannot be reported as an uncommitted leave.
          persister.markDirty(roomCode, session.getFullState());
          await persister.flushNow(roomCode).catch(error => {
            console.warn(`[room:leave] Snapshot write deferred for ${roomCode}:`, error);
          });

          // The membership batch above is the commit boundary. Everything below is live
          // projection/governance cleanup: failures are logged and retried where
          // possible, but the client must receive a deterministic suspended ack.
          try {
            await emitGameUpdate(io, roomCode, session, redis);
            io.to(roomCode).emit('player:disconnected', { playerId: data.user.userId });
            io.to(roomCode).emit('player:autopilot', { playerId: data.user.userId, enabled: true });
          } catch (error) {
            console.warn(`[room:leave] Failed to broadcast suspension in ${roomCode}:`, error);
          }
          removeVoicePresence(io, roomCode, data.user.userId);
          await leaveRoomSocket(redis, socket, roomCode, { preserveMembership: true }).catch(error => {
            console.warn(`[room:leave] Failed to detach socket ${socket.id} from ${roomCode}:`, error);
            data.roomCode = null;
            data.isSpectator = false;
          });

          try {
            const liveHumanIds = await getLiveHumanRoomMemberIds(io, redis, roomCode, session);
            if (liveHumanIds.size === 0) armAllDisconnectTimer(roomCode);
          } catch (error) {
            console.warn(`[room:leave] Failed to refresh live members in ${roomCode}:`, error);
            // The suspension is already durably committed. If liveness cannot be
            // read, conservatively start the grace window so an all-departed room
            // cannot survive forever. The timer rechecks authoritative membership
            // and live sockets before dissolving, so this is harmless when another
            // human is still connected.
            armAllDisconnectTimer(roomCode);
          }

          try {
            const room = await getRoom(redis, roomCode);
            if (room?.ownerId === data.user.userId) {
              const transferred = await transferOwnerToLiveMemberUnlocked(roomCode, data.user.userId);
              if (!transferred) scheduleOwnerTransfer(roomCode, data.user.userId);
            }
          } catch (error) {
            console.warn(`[room:leave] Failed to transfer owner in ${roomCode}:`, error);
            scheduleOwnerTransfer(roomCode, data.user.userId);
          }

          try {
            addAutopilotVote(roomCode, data.user.userId, session, io);
            // Suspending a player who is not responsible for the current action
            // must not restart somebody else's full turn clock. Only redispatch
            // when this player becoming autopilot changes the active driver.
            if (actionPlayerBeforeLeave === data.user.userId) {
              startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
            }
          } catch (error) {
            console.warn(`[room:leave] Failed to re-arm automation in ${roomCode}:`, error);
          }
          return callback?.({ success: true, outcome: 'suspended' });
        }

        // No active game — normal leave flow (waiting room)
        const room = await getRoom(redis, roomCode);
        if (room && room.status !== 'waiting') {
          return callback?.({ success: false, error: '对局状态正在恢复，请稍后重试' });
        }
        if (await isFinalUndepartedHuman(roomCode, data.user.userId)) {
          // The final human leaves through the durable teardown transaction while
          // their roster, mapping and socket are still available for collection.
          try {
            await dissolveRoomUnlocked(
              io,
              redis,
              roomCode,
              sessions,
              turnTimer,
              persister,
              'empty',
              voiceChannels,
              cleanupRoomRuntime,
            );
            return callback?.({ success: true, outcome: 'dissolved' });
          } catch (error) {
            console.error(`[room:leave] Failed to dissolve final waiting room ${roomCode}:`, error);
            return callback?.({ success: false, error: '离开房间失败，请重试' });
          }
        }
        const wasOwner = room?.ownerId === data.user.userId;
        let membership: Awaited<ReturnType<typeof removeMemberWithMembership>>;
        try {
          membership = await removeMemberWithMembership(redis, roomCode, data.user.userId);
        } catch (error) {
          console.error(`[room:leave] Failed to remove waiting membership in ${roomCode}:`, error);
          return callback?.({ success: false, error: '离开房间失败，请重试' });
        }

        removeVoicePresence(io, roomCode, data.user.userId);
        await clearMemberDeparted(redis, roomCode, data.user.userId).catch(error => {
          console.warn(`[room:leave] Failed to clear waiting departure marker in ${roomCode}:`, error);
        });
        await leaveRoomSocket(redis, socket, roomCode).catch(error => {
          console.warn(`[room:leave] Failed to detach waiting socket ${socket.id}:`, error);
          data.roomCode = null;
          data.isSpectator = false;
        });

        if (wasOwner) {
          await transferOwnerToLiveMemberUnlocked(roomCode, data.user.userId).catch(error => {
            console.warn(`[room:leave] Failed to transfer waiting owner in ${roomCode}:`, error);
            scheduleOwnerTransfer(roomCode, data.user.userId);
            return false;
          });
        }
        io.to(roomCode).emit('seat:updated', {
          seats: membership.seats,
          spectators: membership.spectators,
        });
        await broadcastLobbyRooms(redis, io).catch(error => {
          console.warn(`[room:leave] Failed to refresh waiting lobby for ${roomCode}:`, error);
        });
        callback?.({ success: true, outcome: 'left' });
      }),
    );
  });

  socket.on('room:ready', async (ready: boolean, callback) => {
    if (typeof ready !== 'boolean') {
      return callback?.({ success: false, error: '准备状态无效' });
    }
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
    return withRoomLifecycleLock(roomCode, async () => {
      if (data.roomCode !== roomCode) return callback?.({ success: false, error: '不在房间中' });
      const [room, previousSeats] = await Promise.all([getRoom(redis, roomCode), getRoomSeats(redis, roomCode)]);
      if (!room || room.status !== 'waiting') return callback?.({ success: false, error: '只能在等待阶段准备' });
      const currentSeat = previousSeats.find(seat => seat?.userId === data.user.userId);
      if (!currentSeat || currentSeat.isBot) return callback?.({ success: false, error: '只有在座真人可以准备' });
      if (!currentSeat.connected) return callback?.({ success: false, error: '掉线玩家无法准备，请先重连' });
      const previousReady = currentSeat.ready;
      await roomManager.setReady(roomCode, data.user.userId, ready);
      await touchRoomActivity(redis, roomCode);
      const [seats, spectators] = await Promise.all([
        getRoomSeats(redis, roomCode),
        getRoomSpectators(redis, roomCode),
      ]);
      io.to(roomCode).emit('seat:updated', { seats, spectators });
      if (previousReady !== ready) {
        io.to(roomCode).emit('room:ready_changed', { playerId: data.user.userId, ready });
      }
      callback?.({ success: true });
    });
  });

  socket.on('room:update_settings', async (settings: RoomSettingsPatch, callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });
    if (!isCurrentRoomSettingsPatch(settings)) {
      return callback?.({ success: false, error: '房间设置无效' });
    }
    return withRoomLifecycleLock(roomCode, async () => {
      if (data.roomCode !== roomCode) return callback?.({ success: false, error: '不在房间中' });

      const room = await getRoom(redis, roomCode);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (room.ownerId !== data.user.userId) {
        return callback?.({ success: false, error: 'Only room owner can update settings' });
      }
      if (room.status !== 'waiting') {
        return callback?.({ success: false, error: 'Game already in progress' });
      }

      const nextSettings = applyRoomSettingsPatch(room.settings, settings);

      await setRoomSettings(redis, roomCode, nextSettings);
      await touchRoomActivity(redis, roomCode);
      const updatedRoom = await getRoom(redis, roomCode);
      if (!updatedRoom) return callback?.({ success: false, error: '房间不存在' });
      io.to(roomCode).emit('room:updated', { room: updatedRoom });
      callback?.({ success: true, room: updatedRoom });
    });
  });

  socket.on('room:dissolve', async callback => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });
    return withRoomLifecycleLock(roomCode, async () => {
      if (data.roomCode !== roomCode) return callback?.({ success: false, error: '不在房间中' });
      const room = await getRoom(redis, roomCode);
      if (!room || room.ownerId !== data.user.userId) {
        return callback?.({ success: false, error: 'Only room owner can dissolve' });
      }
      await dissolveRoomUnlocked(
        io,
        redis,
        roomCode,
        sessions,
        turnTimer,
        persister,
        'host_closed',
        voiceChannels,
        cleanupRoomRuntime,
      );
      callback?.({ success: true });
    });
  });

  socket.on('room:transfer_owner', async (payload: { targetId: string }, callback) => {
    if (!hasExactKeys(payload, ['targetId']) || !isNonEmptyString(payload['targetId'])) {
      return callback?.({ success: false, error: '目标玩家无效' });
    }
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
    return withRoomLifecycleLock(roomCode, async () => {
      if (data.roomCode !== roomCode) return callback?.({ success: false, error: '不在房间中' });
      const room = await getRoom(redis, roomCode);
      if (!room) return callback?.({ success: false, error: '房间不存在' });
      if (room.ownerId !== data.user.userId) return callback?.({ success: false, error: '只有房主可以移交' });
      if (payload.targetId === data.user.userId) return callback?.({ success: false, error: '不能移交给自己' });
      const [seats, liveHumanIds] = await Promise.all([
        getRoomSeats(redis, roomCode),
        getLiveHumanRoomMemberIds(io, redis, roomCode, sessions.get(roomCode)),
      ]);
      if (
        !getSeatedPlayers(seats).some(p => p.userId === payload.targetId && !p.isBot) ||
        !liveHumanIds.has(payload.targetId) ||
        isNextRoundExcluded(roomCode, payload.targetId)
      ) {
        return callback?.({ success: false, error: '只能移交给在线且在座的玩家' });
      }
      if (!(await setRoomOwnerIfMatches(redis, roomCode, data.user.userId, payload.targetId))) {
        return callback?.({ success: false, error: '房主已变更' });
      }
      // Ownership was committed by the compare-and-set above. Projection
      // failures cannot turn it into an ambiguous failure response.
      try {
        if (cancelOwnerTransfer(roomCode)) io.to(roomCode).emit('room:owner_transfer_cancelled');
      } catch (error) {
        console.warn(`[room:transfer_owner] Failed to broadcast timer cancellation in ${roomCode}:`, error);
      }
      await touchRoomActivity(redis, roomCode).catch(error => {
        console.warn(`[room:transfer_owner] Failed to touch ${roomCode}:`, error);
      });
      try {
        const [updatedRoom, spectators] = await Promise.all([
          getRoom(redis, roomCode),
          getRoomSpectators(redis, roomCode),
        ]);
        if (!updatedRoom) throw new Error(`Room ${roomCode} disappeared after owner transfer`);
        io.to(roomCode).emit('room:updated', { room: updatedRoom });
        io.to(roomCode).emit('seat:updated', { seats, spectators });
      } catch (error) {
        console.warn(`[room:transfer_owner] Failed to broadcast committed owner in ${roomCode}:`, error);
      }
      callback?.({ success: true });
    });
  });

  socket.on('room:kick', async (payload: { targetId: string }, callback) => {
    if (!hasExactKeys(payload, ['targetId']) || !isNonEmptyString(payload['targetId'])) {
      return callback?.({ success: false, error: '目标玩家无效' });
    }
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
    return withUserMembershipLock(payload.targetId, () =>
      withRoomLifecycleLock(roomCode, async () => {
        if (data.roomCode !== roomCode) return callback?.({ success: false, error: '不在房间中' });
        const room = await getRoom(redis, roomCode);
        if (!room) return callback?.({ success: false, error: '房间不存在' });
        if (room.ownerId !== data.user.userId) return callback?.({ success: false, error: '只有房主可以踢人' });
        if (room.status === 'playing') return callback?.({ success: false, error: '游戏进行中无法踢人' });
        if (payload.targetId === data.user.userId) return callback?.({ success: false, error: '不能踢自己' });
        if (
          sessions
            .get(roomCode)
            ?.getFullState()
            .players.some(player => player.id === payload.targetId)
        ) {
          return callback?.({ success: false, error: '结算中的对局玩家只能通过计分板移至观战席' });
        }
        const [seats, spectators] = await Promise.all([
          getRoomSeats(redis, roomCode),
          getRoomSpectators(redis, roomCode),
        ]);
        const allUsers = [...getSeatedPlayers(seats), ...spectators];
        if (!allUsers.some(p => p.userId === payload.targetId))
          return callback?.({ success: false, error: '目标玩家不在房间中' });
        let membership: Awaited<ReturnType<typeof removeMemberWithMembership>>;
        try {
          membership = await removeMemberWithMembership(redis, roomCode, payload.targetId);
        } catch (error) {
          console.error(`[room:kick] Failed to remove membership in ${roomCode}:`, error);
          return callback?.({ success: false, error: '移出玩家失败，请重试' });
        }

        // Atomic roster + reverse mapping removal is the commit boundary. All
        // live projections below are best-effort and cannot make the host retry a
        // membership that has already ended.
        await clearMemberDeparted(redis, roomCode, payload.targetId).catch(error => {
          console.warn(`[room:kick] Failed to clear departure marker for ${payload.targetId}:`, error);
        });
        io.to(`user:${payload.targetId}`).emit('room:membership_ended', {
          roomCode,
          reason: 'kicked',
        });
        removeVoicePresence(io, roomCode, payload.targetId);
        try {
          const targetSockets = await io.in(roomCode).fetchSockets();
          const cleanups: Promise<void>[] = [];
          for (const s of targetSockets) {
            if (s.data.user.userId === payload.targetId) {
              cleanups.push(
                leaveRoomSocket(redis, s, roomCode).catch(error => {
                  const targetData = s.data;
                  targetData.roomCode = null;
                  targetData.isSpectator = false;
                  throw error;
                }),
              );
            }
          }
          const cleanupResults = await Promise.allSettled(cleanups);
          for (const result of cleanupResults) {
            if (result.status === 'rejected') {
              console.warn(`[room:kick] Failed to detach target socket in ${roomCode}:`, result.reason);
            }
          }
        } catch (error) {
          console.warn(`[room:kick] Failed to enumerate target sockets in ${roomCode}:`, error);
        }
        await touchRoomActivity(redis, roomCode).catch(error => {
          console.warn(`[room:kick] Failed to touch ${roomCode}:`, error);
        });
        io.to(roomCode).emit('seat:updated', {
          seats: membership.seats,
          spectators: membership.spectators,
        });
        const kickedSpectator = spectators.find(s => s.userId === payload.targetId);
        if (kickedSpectator) {
          await removePendingSpectatorIntent(roomCode, payload.targetId).catch(error => {
            console.warn(`[room:kick] Failed to clear spectator queue for ${payload.targetId}:`, error);
          });
          await broadcastSpectatorLeft(io, redis, roomCode, payload.targetId, kickedSpectator.nickname).catch(error => {
            console.warn(`[room:kick] Failed to broadcast spectator removal in ${roomCode}:`, error);
          });
        }
        await broadcastLobbyRooms(redis, io).catch(error => {
          console.warn(`[room:kick] Failed to refresh lobby for ${roomCode}:`, error);
        });
        callback?.({ success: true });
      }),
    );
  });

  socket.on('room:list_ai_providers', async (payload: { intent: AiProviderListIntent }, callback) => {
    if (!hasExactKeys(payload, ['intent'])) {
      return callback({ success: false, error: '无效的 AI 引擎查询类型' });
    }
    const roomCode = data.roomCode;
    if (!roomCode) return callback({ success: false, error: '不在房间中' });
    if (payload?.intent !== 'add' && payload?.intent !== 'switch') {
      return callback({ success: false, error: '无效的 AI 引擎查询类型' });
    }
    const [room, seats, providers] = await Promise.all([
      getRoom(redis, roomCode),
      getRoomSeats(redis, roomCode),
      aiProviderRegistry.listEnabled(),
    ]);
    if (!room) return callback({ success: false, error: '房间不存在' });
    const playerCount = getSeatedPlayers(seats).length + (payload.intent === 'add' ? 1 : 0);
    callback({
      success: true,
      providers: filterAiProviderInfos(providers, playerCount, room.settings.houseRules),
    });
  });

  socket.on('room:add_bot', async (payload: BotSelection & { seatIndex?: number }, callback) => {
    if (
      !hasExactKeys(payload, ['difficulty'], ['aiProviderId', 'seatIndex']) ||
      (payload['seatIndex'] !== undefined &&
        (!Number.isInteger(payload['seatIndex']) || payload['seatIndex'] < 0 || payload['seatIndex'] >= SEAT_COUNT))
    ) {
      return callback({ success: false, error: '人机配置无效' });
    }
    const roomCode = data.roomCode;
    if (!roomCode) return callback({ success: false, error: '不在房间中' });
    return withRoomLifecycleLock(roomCode, async () => {
      if (data.roomCode !== roomCode) return callback({ success: false, error: '不在房间中' });
      let selection: BotSelection;
      if (payload.difficulty === 'rl') {
        if (typeof payload.aiProviderId !== 'string' || payload.aiProviderId.length === 0) {
          return callback({ success: false, error: 'RL AI 必须选择具体的 AI 引擎' });
        }
        selection = { difficulty: 'rl', aiProviderId: payload.aiProviderId };
      } else {
        if (!RULE_BOT_DIFFICULTIES.includes(payload.difficulty)) {
          return callback({ success: false, error: '无效的难度等级' });
        }
        if ('aiProviderId' in payload) {
          return callback({ success: false, error: '普通人机不能指定 AI 引擎' });
        }
        selection = { difficulty: payload.difficulty };
      }

      const session = sessions.get(roomCode);
      let result: Awaited<ReturnType<typeof addBot>>;
      try {
        result = await addBot(io, redis, roomCode, data.user.userId, selection, session, payload.seatIndex);
      } catch (error) {
        console.error(`[room:add_bot] Failed in ${roomCode}:`, error);
        result = { success: false, error: '添加机器人失败，请重试' };
      }

      await broadcastLobbyRooms(redis, io).catch(error => {
        console.warn(`[room:add_bot] Failed to refresh lobby for ${roomCode}:`, error);
      });
      callback(result);
    });
  });

  socket.on('room:remove_bot', async (payload: { botId: string }, callback) => {
    if (!hasExactKeys(payload, ['botId']) || !isNonEmptyString(payload['botId'])) {
      return callback({ success: false, error: '目标人机无效' });
    }
    const roomCode = data.roomCode;
    if (!roomCode) return callback({ success: false, error: '不在房间中' });
    return withRoomLifecycleLock(roomCode, async () => {
      if (data.roomCode !== roomCode) return callback({ success: false, error: '不在房间中' });

      const room = await getRoom(redis, roomCode);
      if (!room || room.ownerId !== data.user.userId)
        return callback({ success: false, error: '只有房主可以移除人机' });

      const session = sessions.get(roomCode);

      if (room.status !== 'waiting' || session) {
        return callback({ success: false, error: '只能在等待房间移除机器人' });
      }

      let result: Awaited<ReturnType<typeof removeBot>>;
      try {
        result = await removeBot(io, redis, roomCode, data.user.userId, payload.botId, session);
      } catch (error) {
        console.error(`[room:remove_bot] Failed in ${roomCode}:`, error);
        result = { success: false, error: '移除机器人失败，请重试' };
      }

      await broadcastLobbyRooms(redis, io).catch(error => {
        console.warn(`[room:remove_bot] Failed to refresh lobby for ${roomCode}:`, error);
      });
      callback(result);
    });
  });

  socket.on('room:set_bot_difficulty', async (payload: { botId: string; difficulty: RuleBotDifficulty }, callback) => {
    if (!hasExactKeys(payload, ['botId', 'difficulty']) || !isNonEmptyString(payload['botId'])) {
      return callback({ success: false, error: '人机配置无效' });
    }
    const roomCode = data.roomCode;
    if (!roomCode) return callback({ success: false, error: '不在房间中' });
    return withRoomLifecycleLock(roomCode, async () => {
      if (data.roomCode !== roomCode) return callback({ success: false, error: '不在房间中' });
      if (!RULE_BOT_DIFFICULTIES.includes(payload.difficulty))
        return callback({ success: false, error: '无效的难度等级' });

      const session = sessions.get(roomCode);
      try {
        callback(
          await setBotDifficulty(io, redis, roomCode, data.user.userId, payload.botId, payload.difficulty, session),
        );
      } catch (error) {
        console.error(`[room:set_bot_difficulty] Failed in ${roomCode}:`, error);
        callback({ success: false, error: '修改机器人失败，请重试' });
      }
    });
  });

  socket.on('room:set_bot_ai', async (payload: { botId: string; providerId: string }, callback) => {
    if (
      !hasExactKeys(payload, ['botId', 'providerId']) ||
      !isNonEmptyString(payload['botId']) ||
      !isNonEmptyString(payload['providerId'])
    ) {
      return callback({ success: false, error: '人机配置无效' });
    }
    const roomCode = data.roomCode;
    if (!roomCode) return callback({ success: false, error: '不在房间中' });
    return withRoomLifecycleLock(roomCode, async () => {
      if (data.roomCode !== roomCode) return callback({ success: false, error: '不在房间中' });
      try {
        callback(
          await setBotAi(
            io,
            redis,
            roomCode,
            data.user.userId,
            payload.botId,
            payload.providerId,
            sessions.get(roomCode),
          ),
        );
      } catch (error) {
        console.error(`[room:set_bot_ai] Failed in ${roomCode}:`, error);
        callback({ success: false, error: '修改机器人失败，请重试' });
      }
    });
  });

  socket.on('voice:force_mute', async (payload: { targetId: string; muted: boolean }, callback) => {
    if (
      !hasExactKeys(payload, ['targetId', 'muted']) ||
      !isNonEmptyString(payload['targetId']) ||
      typeof payload['muted'] !== 'boolean'
    ) {
      return callback?.({ success: false, error: '静音请求无效' });
    }
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
    const room = await getRoom(redis, roomCode);
    if (!room) return callback?.({ success: false, error: '房间不存在' });
    if (room.ownerId !== data.user.userId) return callback?.({ success: false, error: '只有房主可以强制静音' });
    if (payload.targetId === data.user.userId) return callback?.({ success: false, error: '不能静音自己' });
    const [seats, spectators] = await Promise.all([getRoomSeats(redis, roomCode), getRoomSpectators(redis, roomCode)]);
    const allUsers = [...getSeatedPlayers(seats), ...spectators];
    if (!allUsers.some(p => p.userId === payload.targetId))
      return callback?.({ success: false, error: '目标玩家不在房间中' });
    setForceMuted(io, roomCode, payload.targetId, payload.muted);
    callback?.({ success: true });
  });

  socket.on('game:start', async callback => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });
    return withRoomLifecycleLock(roomCode, async () => {
      if (data.roomCode !== roomCode) return callback?.({ success: false, error: '不在房间中' });
      const room = await getRoom(redis, roomCode);
      if (!room || room.ownerId !== data.user.userId) {
        return callback?.({ success: false, error: 'Only room owner can start' });
      }
      // Seats keep ready=true for the whole game and status is never checked
      // elsewhere — without this guard a double-click (or a start during the
      // finished scoreboard) rebuilds the session over a live game. The
      // startingRooms entry closes the guard's own TOCTOU window: the checks
      // above sit several awaits before sessions.set, so a concurrent second
      // game:start (buffered double-click flushed in one batch) would pass
      // them too and deal two independent decks.
      if (startingRooms.has(roomCode) || room.status !== 'waiting' || sessions.has(roomCode)) {
        return callback?.({ success: false, error: '游戏已开始' });
      }
      startingRooms.add(roomCode);
      try {
        const seats = await getRoomSeats(redis, roomCode);
        const spectators = await getRoomSpectators(redis, roomCode);
        const activePlayers = getSeatedPlayers(seats);

        if (activePlayers.length < MIN_PLAYERS) {
          return callback?.({ success: false, error: 'Not enough players' });
        }
        const allReady = await roomManager.areAllReady(roomCode);
        if (!allReady) {
          return callback?.({ success: false, error: 'Not all players are ready' });
        }
        const session = GameSession.create(
          activePlayers.map(p => ({
            id: p.userId,
            name: p.nickname,
            avatarUrl: p.avatarUrl,
            role: p.role,
            isBot: p.isBot,
            botConfig: p.botConfig,
          })),
          room.settings,
        );
        persister.revive(roomCode);
        persister.markDirty(roomCode, session.getFullState());
        await persister.flushNow(roomCode);
        await touchRoomActivity(redis, roomCode);
        // `playing` is the durable commit marker. A crash before this write
        // leaves a waiting room that ignores the prewritten snapshot; a crash
        // after it can always restore the complete snapshot.
        await setRoomStatus(redis, roomCode, 'playing');
        sessions.set(roomCode, session);

        // Status + live session are the commit boundary. Install every game
        // driver before touching fallible broadcast projections so a failed
        // adapter/roster read can never leave a committed game frozen.
        startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);

        // Blitz mode: total game time limit
        const blitzLimit = session.getFullState().settings.houseRules.blitzTimeLimit;
        if (blitzLimit) {
          blitzDeadlines.set(roomCode, Date.now() + blitzLimit * 1000);
          armBlitzTimer(io, redis, roomCode, sessions, turnTimer, persister, blitzLimit * 1000);
        }

        // waiting → playing flips the meaning of the spectator list (unseated
        // members → actual watchers). Without a fresh snapshot here, in-game
        // spectator UIs keep whatever list was last broadcast — e.g. the
        // "everyone is a spectator" list from game:back_to_room.
        await broadcastSpectatorList(io, redis, roomCode).catch(error => {
          console.warn(`[game:start] Failed to broadcast spectator list in ${roomCode}:`, error);
        });

        const spectatorMode = room.settings.spectatorMode;
        try {
          const sockets = await io.in(roomCode).fetchSockets();
          for (const s of sockets) {
            const sData = s.data;
            try {
              if (spectators.some(sp => sp.userId === sData.user.userId)) {
                sData.isSpectator = true;
                s.emit('game:state', session.getSpectatorView(spectatorMode));
              } else {
                sData.isSpectator = false;
                s.emit('game:state', session.getPlayerView(sData.user.userId));
              }
            } catch (error) {
              console.warn(`[game:start] Failed to project state to ${sData.user.userId}:`, error);
            }
          }
        } catch (error) {
          console.warn(`[game:start] Failed to enumerate sockets in ${roomCode}:`, error);
        }

        callback?.({ success: true, gameState: session.getPlayerView(data.user.userId) });
        await broadcastLobbyRooms(redis, io).catch(error => {
          console.warn(`[game:start] Failed to refresh lobby for ${roomCode}:`, error);
        });
      } catch (err) {
        // A failure between setRoomStatus('playing') and sessions.set would
        // otherwise brick the room: the status guard above rejects every
        // retry while no session exists to play in.
        if (!sessions.has(roomCode)) {
          await persister.cleanup(roomCode).catch(error => {
            console.error(`[game:start] Failed to stop snapshot writes for ${roomCode}:`, error);
          });
          await deleteGameState(redis, roomCode).catch(error => {
            console.error(`[game:start] Failed to delete rolled-back snapshot for ${roomCode}:`, error);
          });
          persister.revive(roomCode);
          await setRoomStatus(redis, roomCode, 'waiting').catch(error => {
            console.error(`[game:start] Failed to restore waiting status for ${roomCode}:`, error);
          });
        }
        throw err;
      } finally {
        startingRooms.delete(roomCode);
      }
    });
  });
}

async function endGameByBlitz(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  s: GameSession,
  sessions: Map<string, GameSession>,
  turnTimer: TurnTimer,
  persister: GameStatePersister,
): Promise<boolean> {
  // Same winner rule as always: fewest cards when time runs out.
  const state = s.getFullState();
  const minCards = Math.min(...state.players.map(p => p.hand.length));
  const winner = state.players.find(p => p.hand.length === minCards);
  if (!winner) return false;
  s.forceGameOver(winner.id);
  persister.markDirty(roomCode, s.getFullState());
  // Use the same terminal state machine as a normal winning action. It sets
  // the anchor/stops every driver before fallible projections, retains failed
  // snapshots for retry, and retries finished-status/owner governance.
  const handled = await emitTerminalStateIfNeededUnlocked(io, roomCode, s, turnTimer, redis, sessions, persister, {
    gameOverReason: 'blitz_timeout',
  });
  await emitGameUpdate(io, roomCode, s, redis).catch(error => {
    console.warn(`[blitz] Failed to broadcast final state for ${roomCode}:`, error);
  });
  return handled;
}

function armBlitzTimer(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  sessions: Map<string, GameSession>,
  turnTimer: TurnTimer,
  persister: GameStatePersister,
  delayMs: number,
): void {
  const existing = blitzTimers.get(roomCode);
  if (existing) clearTimeout(existing);
  const expectedSession = sessions.get(roomCode);
  const blitzTimer = setTimeout(() => {
    void withRoomLifecycleLock(roomCode, async () => {
      if (blitzTimers.get(roomCode) !== blitzTimer) return;
      blitzTimers.delete(roomCode);
      const s = expectedSession;
      const room = await getRoom(redis, roomCode);
      if (!s || !room || room.status !== 'playing' || sessions.get(roomCode) !== expectedSession || s.isGameOver()) {
        blitzDeadlines.delete(roomCode);
        return;
      }
      // Deadline landed on the round_end scoreboard — ending the game
      // mid-settlement would race the next-round flow. Keep the deadline;
      // game:next_round enforces it before dealing another round.
      if (s.isRoundEnd()) return;
      await endGameByBlitz(io, redis, roomCode, s, sessions, turnTimer, persister);
    }).catch(error => console.error(`[blitz] Failed to end room ${roomCode}:`, error));
  }, delayMs);
  blitzTimer.unref?.();
  blitzTimers.set(roomCode, blitzTimer);
}

/**
 * Rebuild the blitz total-time limit for a session restored after a restart:
 * the in-memory deadline and timer died with the old process, but the
 * snapshot carries gameStartedAt, so the original deadline is recoverable.
 * An already-expired deadline is enforced at the next round boundary (or by
 * the immediately-firing timer when the game is mid-round).
 */
export function rearmBlitzAfterRestore(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  sessions: Map<string, GameSession>,
  turnTimer: TurnTimer,
  persister: GameStatePersister,
): void {
  const state = session.getFullState();
  const limit = state.settings.houseRules.blitzTimeLimit;
  if (!limit || !state.gameStartedAt || state.phase === 'game_over') return;
  const deadline = state.gameStartedAt + limit * 1000;
  blitzDeadlines.set(roomCode, deadline);
  armBlitzTimer(io, redis, roomCode, sessions, turnTimer, persister, Math.max(0, deadline - Date.now()));
}

/**
 * Called by the next-round flow: if the blitz total-time deadline expired
 * while the room sat on the round_end scoreboard, end the game now instead
 * of dealing a round that should never exist. Returns true if it ended.
 */
export async function enforceBlitzDeadline(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  sessions: Map<string, GameSession>,
  turnTimer: TurnTimer,
  persister: GameStatePersister,
): Promise<boolean> {
  const deadline = blitzDeadlines.get(roomCode);
  if (!deadline || Date.now() < deadline) return false;
  return endGameByBlitz(io, redis, roomCode, session, sessions, turnTimer, persister);
}

export async function executeAutopilot(
  session: GameSession,
  playerId: string,
  onPenaltyPause?: () => void | Promise<void>,
  onActionSuccess?: (action: GameAction) => void | Promise<void>,
  isStillValid?: () => boolean,
): Promise<boolean> {
  let acted = false;
  let lastActionTime = 0;
  for (let round = 0; round < 5; round++) {
    if (isStillValid && !isStillValid()) break;
    const st = session.getFullState();
    const cycleGuard = session.getAutomationCycleGuard();
    let actions: GameAction[];
    if (canAutopilotActForPlayer(session, playerId)) {
      actions = chooseAutopilotAction(st, playerId, cycleGuard);
    } else {
      actions = chooseJumpInAction(st, playerId, cycleGuard);
    }
    if (actions.length === 0) break;
    let anySuccess = false;
    let invalidated = false;
    const appliedActions: GameAction[] = [];
    for (const action of actions) {
      const expectedFingerprint = automationStateFingerprint(session.getFullState());
      if (lastActionTime > 0) {
        const elapsed = Date.now() - lastActionTime;
        if (elapsed < AUTOPILOT_MIN_ACTION_INTERVAL_MS) {
          await sleep(AUTOPILOT_MIN_ACTION_INTERVAL_MS - elapsed);
        }
      }
      if (
        (isStillValid && !isStillValid()) ||
        automationStateFingerprint(session.getFullState()) !== expectedFingerprint
      ) {
        invalidated = true;
        break;
      }
      const result = session.applyAction(action);
      if (result.success) {
        appliedActions.push(action);
        lastActionTime = Date.now();
        anySuccess = true;
        await onActionSuccess?.(action);
        await onPenaltyPause?.();
      }
    }
    if (appliedActions.length > 0) {
      session.recordAutomatedTransition(st, appliedActions);
    }
    if (invalidated) break;
    if (!anySuccess) break;
    acted = true;

    const after = session.getFullState();
    if (!canAutopilotActForPlayer(session, playerId)) break;
    if (after.phase === 'playing' && after.lastAction?.type === 'DRAW_CARD') {
      continue;
    }
    break;
  }
  return acted;
}

export function startTurnTimer(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
) {
  if (sessions.get(roomCode) !== session) return;
  const state = session.getFullState();
  const phase = state.phase;

  // Every dispatch invalidates whatever bot thinking timer was armed for the
  // previous turn state — a jump-in or remove_bot can hand the turn to a
  // human mid-think, and the stale timer would force-play them.
  clearBotTurnTimer(roomCode);

  const actingPlayerId = getAutopilotActionPlayerId(state);
  const actingPlayer = actingPlayerId ? state.players.find(p => p.id === actingPlayerId) : null;
  if (actingPlayer?.isBot && !actingPlayer.autopilot) {
    const botConfig = actingPlayer.botConfig;
    if (!botConfig) throw new Error(`Bot ${actingPlayer.id} is missing botConfig`);
    const difficulty = botConfig.difficulty;
    const topCard = state.discardPile[state.discardPile.length - 1];
    const playableCount =
      state.phase === 'playing' && topCard && state.currentColor
        ? getPlayableCards(actingPlayer.hand, topCard, state.currentColor).length
        : 0;

    // Fast draw: skip the full thinking delay when the bot has no decision to
    // make and will just draw a card (penalty draws, draw-until-playable loop,
    // or no playable cards at all).
    const hr = state.settings.houseRules;
    const isPenaltyDraw = state.pendingPenaltyDraws > 0;
    const isDrawLoop =
      state.phase === 'playing' &&
      playableCount === 0 &&
      state.lastAction?.type === 'DRAW_CARD' &&
      state.lastAction.playerId === actingPlayerId &&
      hr.drawUntilPlayable;
    const delayMs =
      isPenaltyDraw || isDrawLoop ? 250 + Math.random() * 250 : calculateBotDelay(difficulty, playableCount);

    turnTimer.stop(roomCode);
    const expectedSession = session;
    const timer = setTimeout(() => {
      void withRoomLifecycleLock(roomCode, async () => {
        if (botTurnTimers.get(roomCode) !== timer || sessions.get(roomCode) !== expectedSession) return;
        const s = expectedSession;
        const fullState = s.getFullState();
        const pid = getAutopilotActionPlayerId(fullState);
        if (!pid) {
          startTurnTimer(io, redis, roomCode, s, turnTimer, sessions, persister);
          return;
        }

        const botPlayer = fullState.players.find(p => p.id === pid);
        // Defense in depth for the entry-point clear above: if the actor
        // changed since this timer was armed and is now a human who neither
        // timed out nor enabled autopilot, force-playing their hand is never
        // acceptable — re-dispatch and let the right branch drive them.
        if (!botPlayer?.isBot && !botPlayer?.autopilot) {
          startTurnTimer(io, redis, roomCode, s, turnTimer, sessions, persister);
          return;
        }
        let actions: GameAction[];
        const cycleGuard = s.getAutomationCycleGuard();
        const currentBotConfig = botPlayer?.isBot ? botPlayer.botConfig : undefined;
        if (botPlayer?.isBot) {
          if (!currentBotConfig) throw new Error(`Bot ${botPlayer.id} is missing botConfig`);
          if (currentBotConfig.difficulty === 'rl') {
            const aiDecision = await chooseBotActionWithAi(fullState, pid, cycleGuard);
            if (botTurnTimers.get(roomCode) !== timer || sessions.get(roomCode) !== expectedSession) return;
            const latestState = s.getFullState();
            const latestBotConfig = latestState.players.find(player => player.id === pid)?.botConfig;
            if (
              automationStateFingerprint(latestState) !== aiDecision.stateFingerprint ||
              !sameBotConfig(latestBotConfig, currentBotConfig)
            ) {
              startTurnTimer(io, redis, roomCode, s, turnTimer, sessions, persister);
              return;
            }
            actions = aiDecision.actions;
          } else {
            actions = chooseBotAction(fullState, pid, cycleGuard);
          }
        } else {
          actions = chooseAutopilotAction(fullState, pid, cycleGuard);
        }

        if (botTurnTimers.get(roomCode) !== timer || sessions.get(roomCode) !== expectedSession) return;
        const appliedActions: GameAction[] = [];
        for (const action of actions) {
          const result = s.applyAction(action);
          if (!result.success) break;
          appliedActions.push(action);
          notifyAutopilotAction(roomCode, s, action);
        }
        if (appliedActions.length > 0) {
          s.recordAutomatedTransition(fullState, appliedActions);
        }

        // Bot UNO call
        if (currentBotConfig) {
          const afterState = s.getFullState();
          const afterPlayer = afterState.players.find(p => p.id === pid);
          if (afterPlayer && afterPlayer.hand.length === 1 && !afterPlayer.calledUno) {
            const params = DIFFICULTY_PARAMS[currentBotConfig.difficulty];
            if (Math.random() < params.unoCallRate) {
              s.applyAction({ type: 'CALL_UNO', playerId: pid });
            }
          }
        }

        persister.markDirty(roomCode, s.getFullState());
        if (botTurnTimers.get(roomCode) !== timer || sessions.get(roomCode) !== expectedSession) return;
        if (
          await driveCommittedActionPostcommit(io, redis, roomCode, s, turnTimer, sessions, persister, {
            lockHeld: true,
            touchActivity: false,
            startNextTurn: false,
            context: 'bot-turn',
          })
        ) {
          return;
        }

        if (botTurnTimers.get(roomCode) !== timer || sessions.get(roomCode) !== expectedSession) return;
        botTurnTimers.delete(roomCode);
        checkBotUnoCatch(io, redis, roomCode, s, persister, emitGameUpdate, sessions);
        // The jump-in itself can be the round-winning play — route its
        // turn-change through the same terminal detection as every other
        // action driver, or the room soft-locks at a scoreboard-less
        // round_end (no game:round_end broadcast, no auto-votes, no
        // cooldown anchor).
        // bot-uno-watcher invokes onTurnChange without awaiting — swallow our
        // own async failures or a kv hiccup becomes an unhandled rejection.
        const jumpInScheduled = checkBotJumpIn(
          io,
          redis,
          roomCode,
          s,
          persister,
          emitGameUpdate,
          async () => {
            try {
              if (await emitTerminalStateIfNeeded(io, roomCode, s, turnTimer, redis, sessions, persister)) {
                return;
              }
              startTurnTimer(io, redis, roomCode, s, turnTimer, sessions, persister);
            } catch (err) {
              console.error(`[jumpIn] onTurnChange failed for room ${roomCode}:`, err);
            }
          },
          sessions,
        );
        if (!jumpInScheduled) {
          startTurnTimer(io, redis, roomCode, s, turnTimer, sessions, persister);
        }
      }).catch(error => console.error(`[botTurn] Failed in room ${roomCode}:`, error));
    }, delayMs);
    timer.unref?.();
    botTurnTimers.set(roomCode, timer);
    return;
  }

  const immediateAutopilotPlayerId = getImmediateAutopilotPlayerId(state);

  if (immediateAutopilotPlayerId) {
    const expectedSession = session;
    let generation = 0;
    generation = turnTimer.start(roomCode, 1, async code => {
      await withRoomLifecycleLock(code, async () => {
        if (sessions.get(code) !== expectedSession || !turnTimer.isGenerationCurrent(code, generation)) return;
        const s = expectedSession;
        const pid = getImmediateAutopilotPlayerId(s.getFullState());
        if (!pid) {
          startTurnTimer(io, redis, code, s, turnTimer, sessions, persister);
          return;
        }
        await executeAutopilot(
          s,
          pid,
          async () => {
            persister.markDirty(code, s.getFullState());
          },
          action => notifyAutopilotAction(code, s, action),
          () => sessions.get(code) === expectedSession && turnTimer.isGenerationCurrent(code, generation),
        );
        if (sessions.get(code) !== expectedSession || !turnTimer.isGenerationCurrent(code, generation)) return;
        persister.markDirty(code, s.getFullState());
        await driveCommittedActionPostcommit(io, redis, code, s, turnTimer, sessions, persister, {
          lockHeld: true,
          touchActivity: false,
          startNextTurn: true,
          context: 'immediate-autopilot',
        });
      });
    });
    return;
  }

  if (phase === 'challenging' || phase === 'choosing_color' || phase === 'choosing_swap_target') {
    const timeLimit = state.settings.houseRules.fastMode
      ? Math.floor(state.settings.turnTimeLimit / 2)
      : state.settings.turnTimeLimit;
    const expectedSession = session;
    let generation = 0;
    generation = turnTimer.start(roomCode, remainingHumanTurnSeconds(state, timeLimit), async code => {
      await withRoomLifecycleLock(code, async () => {
        if (sessions.get(code) !== expectedSession || !turnTimer.isGenerationCurrent(code, generation)) return;
        const s = expectedSession;
        const pid = getAutopilotActionPlayerId(s.getFullState());
        if (!pid) {
          startTurnTimer(io, redis, code, s, turnTimer, sessions, persister);
          return;
        }
        await executeAutopilot(
          s,
          pid,
          async () => {
            persister.markDirty(code, s.getFullState());
          },
          action => notifyAutopilotAction(code, s, action),
          () => sessions.get(code) === expectedSession && turnTimer.isGenerationCurrent(code, generation),
        );
        if (sessions.get(code) !== expectedSession || !turnTimer.isGenerationCurrent(code, generation)) return;
        persister.markDirty(code, s.getFullState());
        if (
          await driveCommittedActionPostcommit(io, redis, code, s, turnTimer, sessions, persister, {
            lockHeld: true,
            touchActivity: false,
            startNextTurn: false,
            context: 'autopilot-timeout',
          })
        ) {
          return;
        }
        io.to(code).emit('player:timeout', { playerId: pid });
        await incrementTimeoutAndAutoAutopilot(io, redis, code, s, pid, persister);
        if (sessions.get(code) !== expectedSession || !turnTimer.isGenerationCurrent(code, generation)) return;
        startTurnTimer(io, redis, code, s, turnTimer, sessions, persister);
      });
    });
    return;
  }

  if (phase !== 'playing') {
    turnTimer.stop(roomCode);
    return;
  }
  const timeLimit = state.settings.houseRules.fastMode
    ? Math.floor(state.settings.turnTimeLimit / 2)
    : state.settings.turnTimeLimit;
  const expectedSession = session;
  let generation = 0;
  generation = turnTimer.start(roomCode, remainingHumanTurnSeconds(state, timeLimit), async code => {
    await withRoomLifecycleLock(code, async () => {
      if (sessions.get(code) !== expectedSession || !turnTimer.isGenerationCurrent(code, generation)) return;
      const s = expectedSession;
      const pid = getAutopilotActionPlayerId(s.getFullState());
      if (!pid) {
        startTurnTimer(io, redis, code, s, turnTimer, sessions, persister);
        return;
      }
      await executeAutopilot(
        s,
        pid,
        async () => {
          persister.markDirty(code, s.getFullState());
        },
        action => notifyAutopilotAction(code, s, action),
        () => sessions.get(code) === expectedSession && turnTimer.isGenerationCurrent(code, generation),
      );
      if (sessions.get(code) !== expectedSession || !turnTimer.isGenerationCurrent(code, generation)) return;
      persister.markDirty(code, s.getFullState());
      if (
        await driveCommittedActionPostcommit(io, redis, code, s, turnTimer, sessions, persister, {
          lockHeld: true,
          touchActivity: false,
          startNextTurn: false,
          context: 'autopilot-timeout',
        })
      ) {
        return;
      }
      io.to(code).emit('player:timeout', { playerId: pid });
      await incrementTimeoutAndAutoAutopilot(io, redis, code, s, pid, persister);
      if (sessions.get(code) !== expectedSession || !turnTimer.isGenerationCurrent(code, generation)) return;
      startTurnTimer(io, redis, code, s, turnTimer, sessions, persister);
    });
  });
}

export function ensureTurnDriver(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
): void {
  if (sessions.get(roomCode) !== session) return;
  if (turnTimer.isRunning(roomCode) || botTurnTimers.has(roomCode)) return;
  startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
}

async function incrementTimeoutAndAutoAutopilot(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  playerId: string,
  persister: GameStatePersister,
): Promise<void> {
  if (!timeoutCounts.has(roomCode)) timeoutCounts.set(roomCode, new Map());
  const roomCounts = timeoutCounts.get(roomCode)!;
  const count = (roomCounts.get(playerId) ?? 0) + 1;
  roomCounts.set(playerId, count);

  const player = session.getFullState().players.find(p => p.id === playerId);
  if (count >= AUTO_AUTOPILOT_THRESHOLD && player && !player.autopilot) {
    session.setPlayerAutopilot(playerId, true);
    persister.markDirty(roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session, redis).catch(error => {
      console.warn(`[autopilot] Post-commit enable projection failed in ${roomCode}:`, error);
    });
    io.to(roomCode).emit('player:autopilot', { playerId, enabled: true });
  }
}

export async function emitGameUpdate(io: SocketIOServer, roomCode: string, session: GameSession, kv: KvStore) {
  const sockets = await io.in(roomCode).fetchSockets();
  const room = await getRoom(kv, roomCode);
  if (!room) throw new Error(`Room ${roomCode} is missing during game update`);
  const spectatorMode = room.settings.spectatorMode;

  const { baseView, hands } = session.getGameUpdateBatch();
  const threshold = baseView.settings.houseRules.handRevealThreshold;
  const requireHand = (playerId: string) => {
    const hand = hands.get(playerId);
    if (!hand) throw new Error(`Missing hand projection for player ${playerId}`);
    return hand;
  };

  for (const s of sockets) {
    const sData = s.data;
    if (sData.isSpectator) {
      if (spectatorMode === 'full') {
        const fullView = {
          ...baseView,
          viewerId: '__spectator__',
          players: baseView.players.map(p => ({ ...p, hand: requireHand(p.id) })),
        };
        s.emit('game:update', fullView);
      } else {
        s.emit('game:update', { ...baseView, viewerId: '__spectator__' });
      }
    } else {
      const userId = sData.user.userId;
      const playerView = {
        ...baseView,
        viewerId: userId,
        players: baseView.players.map(p => {
          if (p.id === userId) {
            return { ...p, hand: requireHand(p.id) };
          }
          if (threshold !== null && p.handCount > 0 && p.handCount <= threshold) {
            return { ...p, hand: requireHand(p.id) };
          }
          return p;
        }),
      };
      s.emit('game:update', playerView);
    }
  }
}

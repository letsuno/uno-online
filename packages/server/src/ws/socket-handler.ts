import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import { authenticateSocketAsync } from '../auth/middleware.js';
import { RoomManager } from '../plugins/core/room/manager.js';
import { TurnTimer } from '../plugins/core/game/turn-timer.js';
import { GameSession } from '../plugins/core/game/session.js';
import { registerRoomEvents, emitGameUpdate, startTurnTimer, executeAutopilot, notifyAutopilotAction, resetPlayerTimeout, rearmBlitzAfterRestore } from './room-events.js';
import { getAutopilotActionPlayerId, canPlayerAutopilotOnce } from './autopilot-action-player.js';
import { registerGameEvents, emitTerminalStateIfNeeded, addAutopilotVote, removePlayerVote, clearChatTimestamps, getRoundEndVoteState, getPendingSpectatorQueue, getRoundEndAt, removePendingSpectatorJoin, reseedTerminalVotes } from './game-events.js';
import { getRoom, setRoomOwner, clearUserRoom, getUserRoom, ensureNotInRoom, setSeatPlayerConnected, getRoomSeats, getRoomSpectators, addSpectatorToRoom, removeDisconnectedSpectators, setSpectatorConnected, getSeatedPlayers, findNextOwner, pickNextOwner, markAllMembersDisconnected } from '../plugins/core/room/store.js';
import { registerSeatEvents, clearPendingSwapRequests, clearUserSwapRequests } from './seat-events.js';
import { joinRoomSocket, leaveRoomSocket } from './socket-room.js';
import { loadGameState, GameStatePersister } from '../plugins/core/game/state-store.js';
import { getActiveRooms } from '../plugins/core/spectate/routes.js';
import { checkRateLimit, clearRateLimit } from './rate-limiter.js';
import { registerInteractionEvents, clearThrowTimestamp } from '../plugins/core/interaction/ws.js';
import { broadcastSpectatorList, broadcastSpectatorLeft, toSpectatorView } from '../plugins/core/spectate/ws.js';
import { dissolveRoom } from './room-lifecycle.js';
import { cancelOwnerTransfer, hasOwnerTransferPending, scheduleOwnerTransfer, configureOwnerTransfer, checkOwnerDisconnectedAtTerminal } from './owner-transfer.js';
import { registerVoicePresenceEvents, removeVoicePresence } from './voice-presence.js';
import { VoiceChannelManager } from '../voice/channel-manager.js';
import type { MumbleIceConfig } from '../config.js';
import { AUTOPILOT_TOGGLE_COOLDOWN_MS } from '@uno-online/shared';

const RECONNECT_TIMEOUT_MS = 30_000;
const AUTOPILOT_THINK_MS = 2_000;
const ROOM_IDLE_SWEEP_MS = 60_000;
const ALL_DISCONNECT_TIMEOUT_MS = 5 * 60_000;

const autopilotToggleTimestamps = new Map<string, number>();

// Re-emit the terminal-state event (round_end / game_over) to a reconnecting
// socket so it can anchor cooldown timers to the original server timestamp,
// instead of re-deriving them from "now".
function replayTerminalEvent(socket: Socket, roomCode: string, session: GameSession): void {
  const state = session.getFullState();
  if (state.phase !== 'round_end' && state.phase !== 'game_over') return;
  const endAt = getRoundEndAt(roomCode);
  if (!endAt) return;
  const scores = Object.fromEntries(state.players.map((p) => [p.id, p.score]));
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
  const roomManager = new RoomManager(redis);
  const turnTimer = new TurnTimer();
  const sessions = new Map<string, GameSession>();
  // Keyed by userId; roomCode records which room the pending cleanup belongs
  // to, so it is only ever cancelled by a rejoin of THAT room — cancelling on
  // mere reconnection (or on rejoin of another room) leaves ghost seats behind.
  const disconnectTimers = new Map<string, { roomCode: string; timer: ReturnType<typeof setTimeout> }>();
  const allDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const autoPlayIntervals = new Map<string, ReturnType<typeof setInterval>>();
  const userSocketMap = new Map<string, string>();
  // Snapshot TTL follows the room's idle lifetime — a snapshot must outlive
  // its room, or late rejoins meet a playing room with nothing to restore.
  const persister = new GameStatePersister(redis, Math.ceil(roomIdleTimeoutMs / 1000));
  const voiceChannels = new VoiceChannelManager(redis, mumbleIce);
  voiceChannels.reconcileActiveRooms().catch(err => console.warn('[voice] reconcile failed:', err));

  io.use(async (socket, next) => {
    const payload = await authenticateSocketAsync(socket, jwtSecret);
    if (!payload) {
      return next(new Error('Authentication failed'));
    }
    socket.data.user = payload;
    socket.data.roomCode = null;
    socket.data.isSpectator = false;
    next();
  });

  io.use((socket, next) => {
    socket.use(([_event], next) => {
      if (!checkRateLimit(socket.id)) {
        return next(new Error('Rate limited'));
      }
      next();
    });
    next();
  });

  function stopAutoPlay(userId: string) {
    const interval = autoPlayIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      autoPlayIntervals.delete(userId);
    }
  }

  function startAutoPlay(userId: string, roomCode: string) {
    stopAutoPlay(userId);
    const interval = setInterval(async () => {
      const session = sessions.get(roomCode);
      if (!session) { stopAutoPlay(userId); return; }
      const state = session.getFullState();
      if (state.phase === 'round_end' || state.phase === 'game_over') { stopAutoPlay(userId); return; }

      if (getAutopilotActionPlayerId(state) !== userId) return;

      const acted = await executeAutopilot(session, userId, async () => {
        persister.markDirty(roomCode, session.getFullState());
      }, (action) => notifyAutopilotAction(roomCode, session, action));

      if (acted) {
        persister.markDirty(roomCode, session.getFullState());
        await emitGameUpdate(io, roomCode, session, redis);
        if (await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, sessions, persister)) {
          return;
        }
        io.to(roomCode).emit('player:timeout', { playerId: userId });
        startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
      }
    }, AUTOPILOT_THINK_MS);
    autoPlayIntervals.set(userId, interval);
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
  function armAllDisconnectTimer(roomCode: string) {
    if (allDisconnectTimers.has(roomCode)) return;
    const dissolutionTimer = setTimeout(async () => {
      allDisconnectTimers.delete(roomCode);
      // Sessions are restored lazily — a post-restart in-game room may have
      // none. The kv room is the source of truth for "still exists".
      if (!(await getRoom(redis, roomCode))) return;
      // Humans may be back without having cancelled this timer — spectator
      // rejoins never cancel it, and the startup reconcile can leave stale
      // flags. Never dissolve over live people; the next full disconnect
      // re-arms.
      const live = await io.in(roomCode).fetchSockets();
      if (live.some(s => s.data.user && !s.data.user.isBot)) return;
      try {
        stopAutoPlayForRoom(roomCode);
        await dissolveRoom(io, redis, roomCode, sessions, turnTimer, persister, 'idle_timeout', voiceChannels);
      } catch (err) {
        console.error(`[allDisconnect] Failed to dissolve room ${roomCode}:`, err);
      }
    }, ALL_DISCONNECT_TIMEOUT_MS);
    dissolutionTimer.unref?.();
    allDisconnectTimers.set(roomCode, dissolutionTimer);
  }


  function stopAutoPlayForRoom(roomCode: string) {
    const session = sessions.get(roomCode);
    if (!session) return;
    for (const player of session.getFullState().players) {
      stopAutoPlay(player.id);
      const entry = disconnectTimers.get(player.id);
      if (entry) {
        clearTimeout(entry.timer);
        disconnectTimers.delete(player.id);
      }
    }
    cancelDissolutionTimer(roomCode);
    cancelOwnerTransfer(roomCode);
  }

  configureOwnerTransfer(io, redis, sessions, turnTimer, persister, voiceChannels, stopAutoPlayForRoom);

  async function getRoomCodes(): Promise<string[]> {
    const keys = await redis.keys('room:*');
    return keys
      .filter(k => !k.includes(':players') && !k.includes(':state') && !k.includes(':spectators') && !k.includes(':seats'))
      .map(k => k.replace('room:', ''));
  }

  async function cleanupIdleRooms() {
    const roomCodes = await getRoomCodes();
    const now = Date.now();
    for (const roomCode of roomCodes) {
      const room = await getRoom(redis, roomCode);
      if (!room) {
        // The key exists (getRoomCodes listed it) but doesn't parse as a
        // room — a handler racing dissolveRoom re-created a partial hash
        // (e.g. touchRoomActivity's hset after deleteRoom). Nothing can
        // ever revive it and `continue` would keep it forever; collect it
        // and its satellites now.
        await Promise.all([
          redis.del(`room:${roomCode}`),
          redis.del(`room:${roomCode}:seats`),
          redis.del(`room:${roomCode}:spectators`),
        ]);
        continue;
      }
      const lastActivityAt = Date.parse(room.lastActivityAt);
      if (!Number.isFinite(lastActivityAt) || now - lastActivityAt < roomIdleTimeoutMs) continue;

      stopAutoPlayForRoom(roomCode);
      await dissolveRoom(io, redis, roomCode, sessions, turnTimer, persister, 'idle_timeout', voiceChannels);
    }
  }

  async function sweepDisconnectedSpectators() {
    const roomCodes = await getRoomCodes();
    for (const roomCode of roomCodes) {
      const removed = await removeDisconnectedSpectators(redis, roomCode, RECONNECT_TIMEOUT_MS);
      if (removed.length === 0) continue;

      let queueChanged = false;
      for (const s of removed) {
        await clearUserRoom(redis, s.userId);
        if (removePendingSpectatorJoin(roomCode, s.userId)) queueChanged = true;
      }
      if (queueChanged) {
        io.to(roomCode).emit('game:spectator_queue', {
          queue: getPendingSpectatorQueue(roomCode), nickname: '', joined: false,
        });
      }
      await broadcastSpectatorList(io, redis, roomCode);

      const room = await getRoom(redis, roomCode);
      if (!room) continue;
      const [seats, remaining] = await Promise.all([
        getRoomSeats(redis, roomCode),
        getRoomSpectators(redis, roomCode),
      ]);
      io.to(roomCode).emit('seat:updated', { seats, spectators: remaining });

      const seatedPlayers = getSeatedPlayers(seats);
      const hasHuman = seatedPlayers.some(p => !p.isBot && p.connected) || remaining.some(sp => sp.connected);
      if (!hasHuman) {
        // In-game rooms get the 5-minute all-disconnect grace — players may
        // be seconds into their own 30s reconnect windows, and dissolving
        // now would kill the game out from under them. Judge "in-game" by
        // room status, NOT sessions.has: sessions are restored lazily, so a
        // post-restart playing room has no session yet and dissolving it
        // here would destroy its recoverable snapshot. Waiting rooms have
        // nothing to preserve; dissolve immediately.
        if (room.status !== 'waiting' || sessions.has(roomCode)) {
          armAllDisconnectTimer(roomCode);
        } else {
          stopAutoPlayForRoom(roomCode);
          await dissolveRoom(io, redis, roomCode, sessions, turnTimer, persister, 'empty', voiceChannels);
        }
        continue;
      }

      if (removed.some(s => s.userId === room.ownerId)) {
        const nextOwnerId = pickNextOwner(seats, remaining, room.ownerId);
        if (nextOwnerId) {
          await setRoomOwner(redis, roomCode, nextOwnerId);
          const updatedRoom = await getRoom(redis, roomCode);
          io.to(roomCode).emit('room:updated', { room: updatedRoom });
        }
      }
    }
  }

  // A fresh process has no sockets, so every connected:true flag left in kv
  // by the previous process is a ghost — never sweepable (spectators lack
  // disconnectedAt), eligible for owner transfers, and counted as "humans
  // present" when deciding whether rooms live or die. Reset them all;
  // rejoins flip them back. Users who reconnect while this sweep runs are
  // protected via the live-socket check.
  (async () => {
    for (const roomCode of await getRoomCodes()) {
      // Liveness via userSocketMap, evaluated inside the seat lock at write
      // time: it's populated synchronously at connection, so anyone who
      // reconnected during this sweep — even mid-rejoin — is spared. A
      // fetchSockets snapshot taken before the lock would race them.
      await markAllMembersDisconnected(redis, roomCode, (uid) => userSocketMap.has(uid));
    }
  })().catch(err => console.warn('[startup] member reconcile failed:', err));

  const idleCleanupInterval = setInterval(() => {
    cleanupIdleRooms().catch(() => {});
  }, ROOM_IDLE_SWEEP_MS);
  idleCleanupInterval.unref?.();

  const spectatorSweepInterval = setInterval(() => {
    sweepDisconnectedSpectators().catch(() => {});
  }, 5_000);
  spectatorSweepInterval.unref?.();

  const serverStartTime = new Date().toISOString();

  io.on('connection', async (socket) => {
    const userId = socket.data.user.userId;

    // 安全防护：任何事件处理器抛错（包括客户端传错参数形态）都不能让进程崩溃
    const rawOn = socket.on.bind(socket);
    socket.on = ((event: string, handler: (...args: never[]) => unknown) =>
      rawOn(event, async (...args: unknown[]) => {
        try {
          await handler(...(args as never[]));
        } catch (err) {
          console.error(`[socket] handler error on "${event}" (user ${userId}):`, err);
        }
      })) as typeof socket.on;

    socket.emit('server:version', { version: serverStartTime, serverTime: Date.now() });

    socket.on('ping:latency', (callback) => callback());

    if (!socket.data.roomCode) {
      getActiveRooms(redis, io).then(rooms => socket.emit('lobby:rooms', rooms));
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

    socket.on('user:current_room', async (callback) => {
      const roomCode = await getUserRoom(redis, userId);
      if (!roomCode) return callback({ roomCode: null });
      const room = await getRoom(redis, roomCode);
      if (!room) {
        await clearUserRoom(redis, userId);
        return callback({ roomCode: null });
      }
      callback({ roomCode });
    });

    // Handle reconnection: restore room and game state
    socket.on('room:rejoin', async (roomCode: string, callback) => {
      const room = await getRoom(redis, roomCode);
      if (!room) {
        // Only drop the reverse mapping if it actually points at this dead
        // room — rejoining a stale URL must not damage the user's real room.
        if ((await getUserRoom(redis, userId)) === roomCode) {
          await clearUserRoom(redis, userId);
        }
        return callback?.({ success: false, error: 'Room not found' });
      }

      // rejoin doubles as the "enter room by URL" path (browser back, pasted
      // links, multi-tab). Never let it silently pull a user out of a room
      // they are still part of.
      const conflict = await ensureNotInRoom(redis, userId, roomCode);
      if (conflict) return callback?.({ success: false, error: conflict });

      const pendingDisconnect = disconnectTimers.get(userId);
      if (pendingDisconnect && pendingDisconnect.roomCode === roomCode) {
        clearTimeout(pendingDisconnect.timer);
        disconnectTimers.delete(userId);
        stopAutoPlay(userId);
      }

      let session = sessions.get(roomCode);
      if (!session) {
        const savedState = await loadGameState(redis, roomCode);
        // Another rejoin may have restored the session during the kv await —
        // restoring twice would clobber its already-updated player flags.
        session = sessions.get(roomCode);
        if (!session && savedState) {
          session = GameSession.fromState(savedState);
          // The snapshot froze connected flags from a process whose sockets
          // are all dead. A ghost connected:true player can never disconnect
          // and never auto-votes — round_end would deadlock waiting for a
          // click that can't come. Everyone re-earns connected via rejoin.
          for (const p of session.getFullState().players) {
            if (!p.isBot) session.setPlayerConnected(p.id, false);
          }
          sessions.set(roomCode, session);
          // A session restored after a server restart lost its in-memory
          // round_end auto-votes — without reseeding they deadlock the vote
          // (and game_over snapshots need their replay anchor back).
          reseedTerminalVotes(io, roomCode, session);
          // No timers survived the restart either: without a driver a
          // restored game freezes whenever the snapshot's current actor is
          // offline (or a bot, when only spectators return). startTurnTimer
          // dispatches bot/autopilot/human phases itself and stops on
          // terminal ones.
          startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
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

      if (session) {
        const isPlayerInGame = session.getFullState().players.some(p => p.id === userId);

        if (!isPlayerInGame) {
          // User is not a player — rejoin as spectator. Members already on the
          // spectator list may always come back (allowSpectators only gates
          // outsiders), and 'finished' counts as spectatable — the game-over
          // scoreboard is still part of the session.
          const existingSpectators = await getRoomSpectators(redis, roomCode);
          const wasSpectator = existingSpectators.some(s => s.userId === userId);
          const statusAllowsSpectate = room.status === 'playing' || room.status === 'finished';
          if (!wasSpectator && !(statusAllowsSpectate && room.settings.allowSpectators)) {
            // The user has no way back into this room; release the reverse
            // mapping or the lobby keeps bouncing them into this dead end.
            if ((await getUserRoom(redis, userId)) === roomCode) {
              await clearUserRoom(redis, userId);
            }
            return callback?.({ success: false, error: '无法观战该房间' });
          }
          await joinRoomSocket(redis, socket, roomCode, { asSpectator: true });
          await addSpectatorToRoom(redis, roomCode, {
            userId: socket.data.user.userId,
            nickname: socket.data.user.nickname,
            avatarUrl: socket.data.user.avatarUrl,
            role: socket.data.user.role,
            connected: true,
          });
          const spectatorMode = (room.settings.spectatorMode as 'full' | 'hidden') ?? 'hidden';
          const view = session.getSpectatorView(spectatorMode);
          callback?.({ success: true, gameState: view, isSpectator: true });
          socket.emit('chat:history', session.getChatHistory());
          const updatedSpectators = toSpectatorView(await getRoomSpectators(redis, roomCode));
          io.to(roomCode).emit('room:spectator_list', { spectators: updatedSpectators });
          socket.to(roomCode).emit('room:spectator_joined', {
            nickname: socket.data.user.nickname,
            spectators: updatedSpectators,
          });
          const queue = getPendingSpectatorQueue(roomCode);
          if (queue.length > 0) {
            socket.emit('game:spectator_queue', { queue, nickname: '', joined: true });
          }
          const voteState = getRoundEndVoteState(roomCode, session);
          if (voteState) socket.emit('game:next_round_vote', voteState);
          replayTerminalEvent(socket, roomCode, session);
          return;
        }

        await joinRoomSocket(redis, socket, roomCode);
        cancelDissolutionTimer(roomCode);
        if (hasOwnerTransferPending(roomCode)) {
          if (room.ownerId === userId) {
            cancelOwnerTransfer(roomCode);
            io.to(roomCode).emit('room:owner_transfer_cancelled');
          }
        }
        session.setPlayerConnected(userId, true);
        session.setPlayerAutopilot(userId, false);
        stopAutoPlay(userId);
        resetPlayerTimeout(roomCode, userId);
        // Their disconnect earned them an auto-vote; now that they're back
        // the justification is gone — the next round needs their own click.
        if (session.isRoundEnd()) {
          removePlayerVote(roomCode, userId, session, io);
        }
        await setSeatPlayerConnected(redis, roomCode, userId, true);
        persister.markDirty(roomCode, session.getFullState());
        await persister.flushNow(roomCode);
        await emitGameUpdate(io, roomCode, session, redis);
        io.to(roomCode).emit('player:reconnected', { playerId: userId });
        io.to(roomCode).emit('player:autopilot', { playerId: userId, enabled: false });
        const [seats, spectators] = await Promise.all([
          getRoomSeats(redis, roomCode),
          getRoomSpectators(redis, roomCode),
        ]);
        callback?.({ success: true, gameState: session.getPlayerView(userId), seats, spectators, room });
        socket.emit('chat:history', session.getChatHistory());
        socket.emit('room:spectator_list', { spectators: toSpectatorView(spectators) });
        // Same replay the spectator branch does — without it a refreshing
        // player loses the "join next round" badges until the queue changes.
        const pendingQueue = getPendingSpectatorQueue(roomCode);
        if (pendingQueue.length > 0) {
          socket.emit('game:spectator_queue', { queue: pendingQueue, nickname: '', joined: true });
        }
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
        startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
      } else {
        const seats = await getRoomSeats(redis, roomCode);
        const spectators = await getRoomSpectators(redis, roomCode);
        const isSeated = seats.some(s => s !== null && s.userId === userId);
        const isSpectator = spectators.some(s => s.userId === userId);

        if (!isSeated && !isSpectator) {
          // Re-add as spectator
          try {
            await roomManager.joinRoom(roomCode, userId, socket.data.user.nickname, socket.data.user.avatarUrl, socket.data.user.role, socket.data.user.isBot);
          } catch {
            // Same as the spectate denial above: a user we refuse to readmit
            // must not stay mapped to the room, or they're locked out of
            // creating/joining anything until the room dies.
            if ((await getUserRoom(redis, userId)) === roomCode) {
              await clearUserRoom(redis, userId);
            }
            return callback?.({ success: false, error: 'Cannot rejoin room' });
          }
        }

        if (isSeated) {
          await setSeatPlayerConnected(redis, roomCode, userId, true);
        } else if (isSpectator) {
          await setSpectatorConnected(redis, roomCode, userId, true);
        }

        await joinRoomSocket(redis, socket, roomCode, { asSpectator: !isSeated });
        if (hasOwnerTransferPending(roomCode) && room.ownerId === userId) {
          cancelOwnerTransfer(roomCode);
          io.to(roomCode).emit('room:owner_transfer_cancelled');
        }
        const [updatedSeats, updatedSpectators] = await Promise.all([
          getRoomSeats(redis, roomCode),
          getRoomSpectators(redis, roomCode),
        ]);
        io.to(roomCode).emit('seat:updated', { seats: updatedSeats, spectators: updatedSpectators });
        callback?.({ success: true, seats: updatedSeats, spectators: updatedSpectators, room });
      }
    });

    registerRoomEvents(socket, io, redis, roomManager, turnTimer, sessions, persister, voiceChannels, armAllDisconnectTimer);
    registerSeatEvents(socket, io, redis);
    registerGameEvents(socket, io, redis, turnTimer, sessions, persister);
    registerInteractionEvents(socket, io);
    registerVoicePresenceEvents(socket, io, (roomCode) => voiceChannels.getRoomChannel(roomCode));

    socket.on('player:toggle-autopilot', async (callback) => {
      const now = Date.now();
      const lastToggle = autopilotToggleTimestamps.get(userId) ?? 0;
      if (now - lastToggle < AUTOPILOT_TOGGLE_COOLDOWN_MS) {
        return callback?.({ success: false, error: '操作太频繁，请稍后再试' });
      }
      autopilotToggleTimestamps.set(userId, now);

      const roomCode = socket.data.roomCode;
      if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
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
      await emitGameUpdate(io, roomCode, session, redis);
      io.to(roomCode).emit('player:autopilot', { playerId: userId, enabled: nextAutopilot });
      callback?.({ success: true, autopilot: nextAutopilot });
    });

    socket.on('game:autopilot_once', async (callback) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
      const session = sessions.get(roomCode);
      if (!session) return callback?.({ success: false, error: '游戏未开始' });
      const state = session.getFullState();
      const player = state.players.find(p => p.id === userId);
      if (!player) return callback?.({ success: false, error: '玩家不在游戏中' });
      if (player.autopilot) return callback?.({ success: false, error: '已在托管中' });
      if (!canPlayerAutopilotOnce(state, userId)) return callback?.({ success: false, error: '不是你的回合' });

      const acted = await executeAutopilot(session, userId, async () => {
        persister.markDirty(roomCode, session.getFullState());
      }, async (action) => {
        notifyAutopilotAction(roomCode, session, action);
        persister.markDirty(roomCode, session.getFullState());
        await emitGameUpdate(io, roomCode, session, redis);
      });

      if (acted) {
        if (await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, sessions, persister)) {
          return callback?.({ success: true });
        }
        startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
      }
      callback?.({ success: true });
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
      removeVoicePresence(io, roomCode, userId);

      if (socket.data.isSpectator) {
        await setSpectatorConnected(redis, roomCode, userId, false);
        const [dcSeats, dcSpectators] = await Promise.all([
          getRoomSeats(redis, roomCode),
          getRoomSpectators(redis, roomCode),
        ]);
        io.to(roomCode).emit('seat:updated', { seats: dcSeats, spectators: dcSpectators });
        io.to(roomCode).emit('room:spectator_list', { spectators: toSpectatorView(dcSpectators) });
        return;
      }

      const session = sessions.get(roomCode);
      if (session) {
        session.setPlayerConnected(userId, false);
        // Keep the seat's connected flag in sync — owner transfer picks the
        // next owner from seats, and a stale `connected: true` hands the room
        // to someone who is gone.
        await setSeatPlayerConnected(redis, roomCode, userId, false);
        persister.markDirty(roomCode, session.getFullState());
        await persister.flushNow(roomCode);
        await emitGameUpdate(io, roomCode, session, redis);
        io.to(roomCode).emit('player:disconnected', { playerId: userId });

        if (session.isRoundEnd()) {
          addAutopilotVote(roomCode, userId, session, io);
        }

        const state = session.getFullState();
        const connectedCount = state.players.filter((p) => p.connected).length;
        const connectedHumanCount = state.players.filter((p) => p.connected && !p.isBot).length;
        if (connectedCount < 2) {
          turnTimer.stop(roomCode);
        }
        if (connectedHumanCount === 0) {
          armAllDisconnectTimer(roomCode);
        }

        const room = await getRoom(redis, roomCode);
        if (room && room.ownerId === userId) {
          const phase = state.phase;
          if (phase === 'round_end' || phase === 'game_over') {
            scheduleOwnerTransfer(roomCode, userId);
          }
        }

        // Start 60s reconnect window, then auto-play
        const timer = setTimeout(async () => {
          disconnectTimers.delete(userId);
          const s = sessions.get(roomCode);
          if (!s) return;
          const st = s.getFullState();
          const stillDisconnected = st.players.find(p => p.id === userId && !p.connected);
          if (stillDisconnected) {
            s.setPlayerAutopilot(userId, true);
            persister.markDirty(roomCode, s.getFullState());
            await emitGameUpdate(io, roomCode, s, redis);
            io.to(roomCode).emit('player:autopilot', { playerId: userId, enabled: true });
            addAutopilotVote(roomCode, userId, s, io);
            startAutoPlay(userId, roomCode);

            // Everyone is offline — but each player has their own 30s
            // window, and the LAST one to drop always arms one, so
            // dissolving here would cap the 5-minute all-disconnect grace
            // at ~30s for every simultaneous-drop (shared WiFi) game.
            // Leave the decision to the 5-minute timer; any rejoin cancels it.
            const hasConnectedHuman = s.getFullState().players.some(p => p.connected && !p.isBot);
            if (!hasConnectedHuman) {
              armAllDisconnectTimer(roomCode);
            }
          }
        }, RECONNECT_TIMEOUT_MS);
        timer.unref?.();
        disconnectTimers.set(userId, { roomCode, timer });
      } else {
        // Mark player as disconnected in seat (also cancels ready)
        await setSeatPlayerConnected(redis, roomCode, userId, false);
        clearUserSwapRequests(roomCode, userId);
        const [disconnectSeats, disconnectSpectators] = await Promise.all([
          getRoomSeats(redis, roomCode),
          getRoomSpectators(redis, roomCode),
        ]);
        io.to(roomCode).emit('seat:updated', { seats: disconnectSeats, spectators: disconnectSpectators });

        // Start reconnect window before removing from room
        const timer = setTimeout(async () => {
          disconnectTimers.delete(userId);
          // Never evict someone who is already back — e.g. re-entered via a
          // room:join that couldn't cancel this timer.
          const liveSockets = await io.in(roomCode).fetchSockets();
          if (liveSockets.some(s => s.data.user?.userId === userId)) return;
          const { deleted } = await roomManager.leaveRoom(roomCode, userId);
          // The user may have legitimately moved to another room since this
          // timer was armed — only clear the mapping if it's still ours.
          if ((await getUserRoom(redis, userId)) === roomCode) {
            await clearUserRoom(redis, userId);
          }
          if (!deleted) {
            const [room, seats, spectators] = await Promise.all([
              getRoom(redis, roomCode),
              getRoomSeats(redis, roomCode),
              getRoomSpectators(redis, roomCode),
            ]);
            io.to(roomCode).emit('seat:updated', { seats, spectators });
            if (room) {
              io.to(roomCode).emit('room:updated', { room });
            }
          } else {
            // Route through dissolveRoom to stay in sync with the other
            // dissolve sites — chiefly so the Mumble channel actually gets
            // removed (the inline form only unmapped the kv key).
            await dissolveRoom(io, redis, roomCode, sessions, turnTimer, persister, 'empty', voiceChannels);
          }
        }, RECONNECT_TIMEOUT_MS);
        timer.unref?.();
        disconnectTimers.set(userId, { roomCode, timer });
      }
    });
  });

  return { roomManager, turnTimer, sessions, persister, voiceChannels };
}

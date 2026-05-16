import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import { authenticateSocketAsync } from '../auth/middleware.js';
import { RoomManager } from '../plugins/core/room/manager.js';
import { TurnTimer } from '../plugins/core/game/turn-timer.js';
import { GameSession } from '../plugins/core/game/session.js';
import { registerRoomEvents, emitGameUpdate, startTurnTimer, executeAutopilot, notifyAutopilotAction, resetPlayerTimeout } from './room-events.js';
import { getAutopilotActionPlayerId, canPlayerAutopilotOnce } from './autopilot-action-player.js';
import { registerGameEvents, addAutopilotVote, clearChatTimestamps, getRoundEndVoteState, getPendingSpectatorQueue, getRoundEndAt } from './game-events.js';
import { getRoom, setRoomOwner, clearUserRoom, getUserRoom, setSeatPlayerConnected, getRoomSeats, getRoomSpectators, getSeatedPlayers } from '../plugins/core/room/store.js';
import { registerSeatEvents, clearPendingSwapRequests, clearUserSwapRequests } from './seat-events.js';
import { joinRoomSocket, leaveRoomSocket } from './socket-room.js';
import { loadGameState, GameStatePersister } from '../plugins/core/game/state-store.js';
import { getActiveRooms } from '../plugins/core/spectate/routes.js';
import { checkRateLimit, clearRateLimit } from './rate-limiter.js';
import { registerInteractionEvents, clearThrowTimestamp } from '../plugins/core/interaction/ws.js';
import { setupSpectateHandlers, getSpectatorNames, addSpectator, broadcastSpectatorList } from '../plugins/core/spectate/ws.js';
import { dissolveRoom } from './room-lifecycle.js';
import { registerVoicePresenceEvents, removeVoicePresence } from './voice-presence.js';
import { VoiceChannelManager } from '../voice/channel-manager.js';
import type { MumbleIceConfig } from '../config.js';

const RECONNECT_TIMEOUT_MS = 60_000;
const AUTOPILOT_THINK_MS = 2_000;
const ROOM_IDLE_SWEEP_MS = 60_000;
const AUTOPILOT_TOGGLE_COOLDOWN_MS = 3_000;
const ALL_DISCONNECT_TIMEOUT_MS = 5 * 60_000;
const OWNER_TRANSFER_DELAY_S = 10;

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
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const allDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const ownerTransferTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const autoPlayIntervals = new Map<string, ReturnType<typeof setInterval>>();
  const userSocketMap = new Map<string, string>();
  const persister = new GameStatePersister(redis);
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

  function cancelOwnerTransferTimer(roomCode: string) {
    const timer = ownerTransferTimers.get(roomCode);
    if (timer) {
      clearTimeout(timer);
      ownerTransferTimers.delete(roomCode);
    }
  }

  function stopAutoPlayForRoom(roomCode: string) {
    const session = sessions.get(roomCode);
    if (!session) return;
    for (const player of session.getFullState().players) {
      stopAutoPlay(player.id);
      const timer = disconnectTimers.get(player.id);
      if (timer) {
        clearTimeout(timer);
        disconnectTimers.delete(player.id);
      }
    }
    cancelDissolutionTimer(roomCode);
    cancelOwnerTransferTimer(roomCode);
  }

  async function cleanupIdleRooms() {
    const roomKeys = (await redis.keys('room:*')).filter(k => !k.includes(':players') && !k.includes(':state'));
    const now = Date.now();
    for (const key of roomKeys) {
      const roomCode = key.replace('room:', '');
      const room = await getRoom(redis, roomCode);
      if (!room) continue;
      const lastActivityAt = Date.parse(room.lastActivityAt);
      if (!Number.isFinite(lastActivityAt) || now - lastActivityAt < roomIdleTimeoutMs) continue;

      stopAutoPlayForRoom(roomCode);
      await dissolveRoom(io, redis, roomCode, sessions, turnTimer, persister, 'idle_timeout', voiceChannels);
    }
  }

  const idleCleanupInterval = setInterval(() => {
    cleanupIdleRooms().catch(() => {});
  }, ROOM_IDLE_SWEEP_MS);
  idleCleanupInterval.unref?.();

  const serverStartTime = new Date().toISOString();

  io.on('connection', async (socket) => {
    const userId = socket.data.user.userId;

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

    // Cancel any pending disconnect timeout for this user (reconnection)
    const pendingTimer = disconnectTimers.get(userId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      disconnectTimers.delete(userId);
      stopAutoPlay(userId);
    }

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
        await clearUserRoom(redis, userId);
        return callback?.({ success: false, error: 'Room not found' });
      }

      let session = sessions.get(roomCode);
      if (!session) {
        const savedState = await loadGameState(redis, roomCode);
        if (savedState) {
          session = GameSession.fromState(savedState);
          sessions.set(roomCode, session);
        }
      }

      if (session) {
        const isPlayerInGame = session.getFullState().players.some(p => p.id === userId);

        if (!isPlayerInGame) {
          // User is not a player — rejoin as spectator
          if (!(room.status === 'playing' && room.settings.allowSpectators)) {
            return callback?.({ success: false, error: '无法观战该房间' });
          }
          await joinRoomSocket(redis, socket, roomCode, { asSpectator: true });
          addSpectator(roomCode, socket.data.user.userId, socket.data.user.nickname, socket.data.user.avatarUrl);
          const spectatorMode = (room.settings.spectatorMode as 'full' | 'hidden') ?? 'hidden';
          const view = session.getSpectatorView(spectatorMode);
          callback?.({ success: true, gameState: view, isSpectator: true });
          socket.emit('chat:history', session.getChatHistory());
          broadcastSpectatorList(io, roomCode);
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
        if (ownerTransferTimers.has(roomCode)) {
          if (room.ownerId === userId) {
            cancelOwnerTransferTimer(roomCode);
            io.to(roomCode).emit('room:owner_transfer_cancelled');
          }
        }
        session.setPlayerConnected(userId, true);
        session.setPlayerAutopilot(userId, false);
        resetPlayerTimeout(roomCode, userId);
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
        socket.emit('room:spectator_list', { spectators: getSpectatorNames(roomCode) });
        const voteState = getRoundEndVoteState(roomCode, session);
        if (voteState) socket.emit('game:next_round_vote', voteState);
        replayTerminalEvent(socket, roomCode, session);
        const state = session.getFullState();
        const connectedCount = state.players.filter(p => p.connected).length;
        if (connectedCount >= 2 && state.phase === 'playing') {
          startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
        }
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
            return callback?.({ success: false, error: 'Cannot rejoin room' });
          }
        }

        if (isSeated) {
          await setSeatPlayerConnected(redis, roomCode, userId, true);
        }

        await joinRoomSocket(redis, socket, roomCode);
        const [updatedSeats, updatedSpectators] = await Promise.all([
          getRoomSeats(redis, roomCode),
          getRoomSpectators(redis, roomCode),
        ]);
        io.to(roomCode).emit('seat:updated', { seats: updatedSeats, spectators: updatedSpectators });
        callback?.({ success: true, seats: updatedSeats, spectators: updatedSpectators, room });
      }
    });

    registerRoomEvents(socket, io, redis, roomManager, turnTimer, sessions, persister, voiceChannels);
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
        addAutopilotVote(roomCode, userId, session, io);
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

      const session = sessions.get(roomCode);
      if (session) {
        session.setPlayerConnected(userId, false);
        persister.markDirty(roomCode, session.getFullState());
        await persister.flushNow(roomCode);
        await emitGameUpdate(io, roomCode, session, redis);
        io.to(roomCode).emit('player:disconnected', { playerId: userId });

        const state = session.getFullState();
        const connectedCount = state.players.filter((p) => p.connected).length;
        if (connectedCount < 2) {
          turnTimer.stop(roomCode);
        }
        if (connectedCount === 0 && !allDisconnectTimers.has(roomCode)) {
          const dissolutionTimer = setTimeout(async () => {
            allDisconnectTimers.delete(roomCode);
            if (!sessions.has(roomCode)) return;
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

        // Host transfer: if disconnected player is room owner
        const room = await getRoom(redis, roomCode);
        if (room && room.ownerId === userId) {
          const phase = state.phase;
          if (phase === 'round_end' || phase === 'game_over') {
            cancelOwnerTransferTimer(roomCode);
            io.to(roomCode).emit('room:owner_transfer_pending', { transferAt: Date.now() + OWNER_TRANSFER_DELAY_S * 1000 });
            const timer = setTimeout(async () => {
              ownerTransferTimers.delete(roomCode);
              const s = sessions.get(roomCode);
              if (!s) return;
              const st = s.getFullState();
              if (st.players.find(p => p.id === userId && p.connected)) return;
              const nextOwner = st.players.find(p => p.id !== userId && p.connected && !p.isBot);
              if (!nextOwner) return;
              await setRoomOwner(redis, roomCode, nextOwner.id);
              const updatedRoom = await getRoom(redis, roomCode);
              const [seats, spectators] = await Promise.all([getRoomSeats(redis, roomCode), getRoomSpectators(redis, roomCode)]);
              io.to(roomCode).emit('seat:updated', { seats, spectators });
              io.to(roomCode).emit('room:updated', { room: updatedRoom });
            }, OWNER_TRANSFER_DELAY_S * 1000);
            timer.unref?.();
            ownerTransferTimers.set(roomCode, timer);
          } else if (phase !== 'playing') {
            const nextOwner = state.players.find(p => p.id !== userId && p.connected && !p.isBot);
            if (nextOwner) {
              await setRoomOwner(redis, roomCode, nextOwner.id);
              const updatedRoom = await getRoom(redis, roomCode);
              const [seats, spectators] = await Promise.all([getRoomSeats(redis, roomCode), getRoomSpectators(redis, roomCode)]);
              io.to(roomCode).emit('seat:updated', { seats, spectators });
              io.to(roomCode).emit('room:updated', { room: updatedRoom });
            }
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
            startAutoPlay(userId, roomCode);
          }
        }, RECONNECT_TIMEOUT_MS);
        disconnectTimers.set(userId, timer);
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
          const [{ deleted }] = await Promise.all([
            roomManager.leaveRoom(roomCode, userId),
            clearUserRoom(redis, userId),
          ]);
          if (!deleted) {
            const [room, seats, spectators] = await Promise.all([
              getRoom(redis, roomCode),
              getRoomSeats(redis, roomCode),
              getRoomSpectators(redis, roomCode),
            ]);
            io.to(roomCode).emit('seat:updated', { seats, spectators });
            // If leaver was owner, room:updated already emitted by leaveRoom's transfer
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
        disconnectTimers.set(userId, timer);
      }
    });
  });

  setupSpectateHandlers(io, redis, sessions);

  return { roomManager, turnTimer, sessions, persister, voiceChannels };
}

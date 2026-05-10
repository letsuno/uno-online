import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../kv/types';
import { authenticateSocket } from '../auth/middleware';
import { RoomManager } from '../plugins/core/room/manager';
import { TurnTimer } from '../plugins/core/game/turn-timer';
import { GameSession } from '../plugins/core/game/session';
import { registerRoomEvents, emitGameUpdate, startTurnTimer, executeAutopilot, notifyAutopilotAction, resetPlayerTimeout } from './room-events';
import { getAutopilotActionPlayerId } from './autopilot-action-player';
import { registerGameEvents, addAutopilotVote, clearChatTimestamps } from './game-events';
import { getRoom, getRoomPlayers, setRoomOwner } from '../plugins/core/room/store';
import { loadGameState, GameStatePersister } from '../plugins/core/game/state-store';
import { checkRateLimit, clearRateLimit } from './rate-limiter';
import { registerInteractionEvents, clearThrowTimestamp } from '../plugins/core/interaction/ws';
import { setupSpectateHandlers } from '../plugins/core/spectate/ws';
import { getDb } from '../db/database';
import { dissolveRoom } from './room-lifecycle';
import { registerVoicePresenceEvents, removeVoicePresence } from './voice-presence';

const RECONNECT_TIMEOUT_MS = 60_000;
const AUTOPILOT_THINK_MS = 2_000;
const ROOM_IDLE_SWEEP_MS = 60_000;
const AUTOPILOT_TOGGLE_COOLDOWN_MS = 3_000;

const autopilotToggleTimestamps = new Map<string, number>();

export function setupSocketHandlers(io: SocketIOServer, redis: KvStore, jwtSecret: string, roomIdleTimeoutMs: number) {
  const roomManager = new RoomManager(redis);
  const turnTimer = new TurnTimer();
  const sessions = new Map<string, GameSession>();
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const autoPlayIntervals = new Map<string, ReturnType<typeof setInterval>>();
  const userSocketMap = new Map<string, string>();
  const persister = new GameStatePersister(redis);

  io.use((socket, next) => {
    const payload = authenticateSocket(socket, jwtSecret);
    if (!payload) {
      return next(new Error('Authentication failed'));
    }
    socket.data.user = payload;
    socket.data.roomCode = null;
    socket.data.isSpectator = false;
    next();
  });

  io.use((socket, next) => {
    socket.use(([event], next) => {
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
        await emitGameUpdate(io, roomCode, session, redis);
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
      await dissolveRoom(io, redis, roomCode, sessions, turnTimer, persister, 'idle_timeout', getDb());
    }
  }

  const idleCleanupInterval = setInterval(() => {
    cleanupIdleRooms().catch(() => {});
  }, ROOM_IDLE_SWEEP_MS);
  idleCleanupInterval.unref?.();

  io.on('connection', async (socket) => {
    const userId = socket.data.user.userId;

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

    // Handle reconnection: restore room and game state
    socket.on('room:rejoin', async (roomCode: string, callback) => {
      const room = await getRoom(redis, roomCode);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      socket.data.roomCode = roomCode;
      await socket.join(roomCode);

      let session = sessions.get(roomCode);
      if (!session) {
        const savedState = await loadGameState(redis, roomCode);
        if (savedState) {
          session = GameSession.fromState(savedState);
          sessions.set(roomCode, session);
        }
      }

      if (session) {
        session.setPlayerConnected(userId, true);
        session.setPlayerAutopilot(userId, false);
        resetPlayerTimeout(roomCode, userId);
        persister.markDirty(roomCode, session.getFullState());
        await persister.flushNow(roomCode);
        await emitGameUpdate(io, roomCode, session, redis);
        io.to(roomCode).emit('player:reconnected', { playerId: userId });
        io.to(roomCode).emit('player:autopilot', { playerId: userId, enabled: false });
        const players = await getRoomPlayers(redis, roomCode);
        callback?.({ success: true, gameState: session.getPlayerView(userId), players, room });
        socket.emit('chat:history', session.getChatHistory());
        const state = session.getFullState();
        const connectedCount = state.players.filter(p => p.connected).length;
        if (connectedCount >= 2 && state.phase === 'playing') {
          startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
        }
      } else {
        const players = await getRoomPlayers(redis, roomCode);
        const alreadyInRoom = players.some(p => p.userId === userId);
        if (!alreadyInRoom) {
          try {
            await roomManager.joinRoom(roomCode, userId, socket.data.user.nickname, socket.data.user.avatarUrl, socket.data.user.role);
          } catch {
            return callback?.({ success: false, error: 'Cannot rejoin room' });
          }
        }
        const updatedPlayers = await getRoomPlayers(redis, roomCode);
        io.to(roomCode).emit('room:updated', { players: updatedPlayers, room });
        callback?.({ success: true, players: updatedPlayers, room });
      }
    });

    registerRoomEvents(socket, io, redis, roomManager, turnTimer, sessions, getDb(), persister);
    registerGameEvents(socket, io, redis, turnTimer, sessions, getDb(), persister);
    registerInteractionEvents(socket, io);
    registerVoicePresenceEvents(socket, io);

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

        // Host transfer: if disconnected player is room owner, transfer
        const room = await getRoom(redis, roomCode);
        if (room && room.ownerId === userId) {
          const nextOwner = state.players.find(p => p.id !== userId && p.connected);
          if (nextOwner) {
            await setRoomOwner(redis, roomCode, nextOwner.id);
            const updatedRoom = await getRoom(redis, roomCode);
            const players = await getRoomPlayers(redis, roomCode);
            io.to(roomCode).emit('room:updated', { players, room: updatedRoom });
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
          }
        }, RECONNECT_TIMEOUT_MS);
        disconnectTimers.set(userId, timer);
      } else {
        // Start reconnect window before removing from room
        const timer = setTimeout(async () => {
          disconnectTimers.delete(userId);
          const { deleted } = await roomManager.leaveRoom(roomCode, userId);
          if (!deleted) {
            const room = await getRoom(redis, roomCode);
            const players = await getRoomPlayers(redis, roomCode);
            io.to(roomCode).emit('room:updated', { players, room });
          } else {
            sessions.delete(roomCode);
            turnTimer.stop(roomCode);
          }
        }, RECONNECT_TIMEOUT_MS);
        disconnectTimers.set(userId, timer);
      }
    });
  });

  setupSpectateHandlers(io, redis, sessions);

  return { roomManager, turnTimer, sessions };
}

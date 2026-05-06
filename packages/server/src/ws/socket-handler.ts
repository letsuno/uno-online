import type { Server as SocketIOServer } from 'socket.io';
import type Redis from 'ioredis';
import { authenticateSocket } from '../auth/middleware';
import { RoomManager } from '../room/room-manager';
import { TurnTimer } from '../game/turn-timer';
import { GameSession } from '../game/game-session';
import { registerRoomEvents, emitGameUpdate, startTurnTimer } from './room-events';
import { registerGameEvents } from './game-events';
import { registerVoiceEvents, removeVoicePeer } from '../voice/voice-events';
import { getRoom, getRoomPlayers, setRoomOwner } from '../room/room-store';
import { saveGameState, loadGameState } from '../game/game-store';
import { checkRateLimit, clearRateLimit } from './rate-limiter';
import { registerInteractionEvents, clearThrowTimestamp } from './interaction-events';

const RECONNECT_TIMEOUT_MS = 60_000;

export function setupSocketHandlers(io: SocketIOServer, redis: Redis, jwtSecret: string) {
  const roomManager = new RoomManager(redis);
  const turnTimer = new TurnTimer();
  const sessions = new Map<string, GameSession>();
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const autoPlayIntervals = new Map<string, ReturnType<typeof setInterval>>();

  io.use((socket, next) => {
    const payload = authenticateSocket(socket, jwtSecret);
    if (!payload) {
      return next(new Error('Authentication failed'));
    }
    socket.data.user = payload;
    socket.data.roomCode = null;
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
      if (state.phase !== 'playing') return;
      const currentPlayer = state.players[state.currentPlayerIndex];
      if (!currentPlayer || currentPlayer.id !== userId) return;
      session.applyAction({ type: 'DRAW_CARD', playerId: userId });
      session.applyAction({ type: 'PASS', playerId: userId });
      await saveGameState(redis, roomCode, session.getFullState());
      await emitGameUpdate(io, roomCode, session);
      io.to(roomCode).emit('player:timeout', { playerId: userId });
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    }, 5000);
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

  io.on('connection', async (socket) => {
    const userId = socket.data.user.userId;

    // Multi-tab: kick existing connection for same user
    const existingSockets = await io.fetchSockets();
    for (const existing of existingSockets) {
      if (existing.id !== socket.id && existing.data?.user?.userId === userId) {
        existing.emit('auth:kicked', { reason: '已在其他地方登录' });
        existing.disconnect(true);
      }
    }

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
        await saveGameState(redis, roomCode, session.getFullState());
        await emitGameUpdate(io, roomCode, session);
        io.to(roomCode).emit('player:reconnected', { playerId: userId });
        callback?.({ success: true, gameState: session.getPlayerView(userId) });
        const state = session.getFullState();
        const connectedCount = state.players.filter(p => p.connected).length;
        if (connectedCount >= 2 && state.phase === 'playing') {
          startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
        }
      } else {
        const players = await getRoomPlayers(redis, roomCode);
        const alreadyInRoom = players.some(p => p.userId === userId);
        if (!alreadyInRoom) {
          try {
            await roomManager.joinRoom(roomCode, userId, socket.data.user.username);
          } catch {
            return callback?.({ success: false, error: 'Cannot rejoin room' });
          }
        }
        const updatedPlayers = await getRoomPlayers(redis, roomCode);
        io.to(roomCode).emit('room:updated', { players: updatedPlayers, room });
        callback?.({ success: true, players: updatedPlayers, room });
      }
    });

    registerRoomEvents(socket, io, redis, roomManager, turnTimer, sessions);
    registerGameEvents(socket, io, redis, turnTimer, sessions);
    registerVoiceEvents(socket, io);
    registerInteractionEvents(socket, io);

    socket.on('disconnect', async () => {
      clearRateLimit(socket.id);
      clearThrowTimestamp(userId);
      const roomCode = socket.data.roomCode;
      if (roomCode) {
        await removeVoicePeer(roomCode, userId, io);
      }
      if (!roomCode) return;

      const session = sessions.get(roomCode);
      if (session) {
        session.setPlayerConnected(userId, false);
        await saveGameState(redis, roomCode, session.getFullState());
        await emitGameUpdate(io, roomCode, session);
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
        const timer = setTimeout(() => {
          disconnectTimers.delete(userId);
          const s = sessions.get(roomCode);
          if (!s) return;
          const st = s.getFullState();
          const stillDisconnected = st.players.find(p => p.id === userId && !p.connected);
          if (stillDisconnected) {
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
          }
        }, RECONNECT_TIMEOUT_MS);
        disconnectTimers.set(userId, timer);
      }
    });
  });

  return { roomManager, turnTimer, sessions };
}

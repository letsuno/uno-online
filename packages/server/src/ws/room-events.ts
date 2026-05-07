import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import type { RoomSettings } from '@uno-online/shared';
import { MIN_PLAYERS, DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import { RoomManager } from '../plugins/core/room/manager';
import { getRoom, getRoomPlayers, setRoomSettings, setRoomStatus, deleteRoom } from '../plugins/core/room/store';
import { GameSession } from '../plugins/core/game/session';
import { saveGameState } from '../plugins/core/game/state-store';
import type { TurnTimer } from '../plugins/core/game/turn-timer';
import { setGameStartTime } from './game-events';
import type { SocketData } from './types';

export function registerRoomEvents(
  socket: Socket,
  io: SocketIOServer,
  redis: KvStore,
  roomManager: RoomManager,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
) {
  const data = socket.data as SocketData;

  socket.on('room:create', async (settings: Partial<RoomSettings>, callback) => {
    const roomSettings: RoomSettings = {
      turnTimeLimit: settings?.turnTimeLimit ?? 30,
      targetScore: settings?.targetScore ?? 500,
      houseRules: settings?.houseRules ?? DEFAULT_HOUSE_RULES,
    };
    const code = await roomManager.createRoom(data.user.userId, data.user.nickname, roomSettings, data.user.avatarUrl, data.user.role);
    data.roomCode = code;
    await socket.join(code);
    const room = await getRoom(redis, code);
    const players = await getRoomPlayers(redis, code);
    callback({ success: true, roomCode: code, players, room });
  });

  socket.on('room:join', async (roomCode: string, callback) => {
    try {
      const room = await getRoom(redis, roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });

      const players = await getRoomPlayers(redis, roomCode);
      const alreadyInRoom = players.some(p => p.userId === data.user.userId);

      if (alreadyInRoom) {
        data.roomCode = roomCode;
        await socket.join(roomCode);
        if (room.status !== 'waiting') {
          socket.emit('room:rejoin_redirect', { roomCode });
        }
        return callback({ success: true, players, room, rejoin: room.status !== 'waiting' });
      }

      await roomManager.joinRoom(roomCode, data.user.userId, data.user.nickname, data.user.avatarUrl, data.user.role);
      data.roomCode = roomCode;
      await socket.join(roomCode);
      const updatedPlayers = await getRoomPlayers(redis, roomCode);
      io.to(roomCode).emit('room:updated', { players: updatedPlayers, room });
      callback({ success: true, players: updatedPlayers, room });
    } catch (err) {
      callback({ success: false, error: (err as Error).message });
    }
  });

  socket.on('room:leave', async (callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });
    const { deleted } = await roomManager.leaveRoom(roomCode, data.user.userId);
    socket.leave(roomCode);
    data.roomCode = null;
    if (!deleted) {
      const room = await getRoom(redis, roomCode);
      const players = await getRoomPlayers(redis, roomCode);
      io.to(roomCode).emit('room:updated', { players, room });
    }
    callback?.({ success: true });
  });

  socket.on('room:ready', async (ready: boolean, callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });
    await roomManager.setReady(roomCode, data.user.userId, ready);
    const players = await getRoomPlayers(redis, roomCode);
    io.to(roomCode).emit('room:updated', { players });
    callback?.({ success: true });
  });

  socket.on('room:update_settings', async (settings: Partial<RoomSettings>, callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });

    const room = await getRoom(redis, roomCode);
    if (!room) return callback?.({ success: false, error: 'Room not found' });
    if (room.ownerId !== data.user.userId) {
      return callback?.({ success: false, error: 'Only room owner can update settings' });
    }
    if (room.status !== 'waiting') {
      return callback?.({ success: false, error: 'Game already in progress' });
    }

    const nextSettings: RoomSettings = {
      turnTimeLimit: settings.turnTimeLimit ?? room.settings.turnTimeLimit ?? 30,
      targetScore: settings.targetScore ?? room.settings.targetScore ?? 500,
      houseRules: {
        ...DEFAULT_HOUSE_RULES,
        ...(room.settings.houseRules ?? {}),
        ...(settings.houseRules ?? {}),
      },
    };

    await setRoomSettings(redis, roomCode, nextSettings);
    const players = await getRoomPlayers(redis, roomCode);
    const updatedRoom = await getRoom(redis, roomCode);
    io.to(roomCode).emit('room:updated', { players, room: updatedRoom });
    callback?.({ success: true, room: updatedRoom });
  });

  socket.on('room:dissolve', async (callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });
    const room = await getRoom(redis, roomCode);
    if (!room || room.ownerId !== data.user.userId) {
      return callback?.({ success: false, error: 'Only room owner can dissolve' });
    }
    turnTimer.stop(roomCode);
    sessions.delete(roomCode);
    io.to(roomCode).emit('room:dissolved');
    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      (s.data as SocketData).roomCode = null;
      s.leave(roomCode);
    }
    await deleteRoom(redis, roomCode);
    callback?.({ success: true });
  });

  socket.on('game:start', async (callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });
    const room = await getRoom(redis, roomCode);
    if (!room || room.ownerId !== data.user.userId) {
      return callback?.({ success: false, error: 'Only room owner can start' });
    }
    const rawPlayers = await getRoomPlayers(redis, roomCode);
    const seen = new Set<string>();
    const players = rawPlayers.filter(p => {
      if (seen.has(p.userId)) return false;
      seen.add(p.userId);
      return true;
    });
    if (players.length < MIN_PLAYERS) {
      return callback?.({ success: false, error: 'Not enough players' });
    }
    const allReady = await roomManager.areAllReady(roomCode);
    if (!allReady) {
      return callback?.({ success: false, error: 'Not all players are ready' });
    }
    await setRoomStatus(redis, roomCode, 'playing');
    const session = GameSession.create(
      players.map((p) => ({ id: p.userId, name: p.nickname, avatarUrl: p.avatarUrl ?? null, role: p.role as import('@uno-online/shared').UserRole | undefined })),
      { turnTimeLimit: room.settings?.turnTimeLimit ?? 30, targetScore: room.settings?.targetScore ?? 500, houseRules: room.settings?.houseRules ?? DEFAULT_HOUSE_RULES } as RoomSettings,
    );
    sessions.set(roomCode, session);
    setGameStartTime(roomCode);
    await saveGameState(redis, roomCode, session.getFullState());

    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      const userId = (s.data as SocketData).user.userId;
      s.emit('game:state', session.getPlayerView(userId));
    }

    startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);

    // Blitz mode: total game time limit
    const blitzLimit = session.getFullState().settings.houseRules.blitzTimeLimit;
    if (blitzLimit) {
      setTimeout(async () => {
        const s = sessions.get(roomCode);
        if (!s || s.isGameOver() || s.isRoundEnd()) return;
        // Find player with fewest cards
        const state = s.getFullState();
        const minCards = Math.min(...state.players.map(p => p.hand.length));
        const winner = state.players.find(p => p.hand.length === minCards);
        if (winner) {
          s.forceGameOver(winner.id);
          await saveGameState(redis, roomCode, s.getFullState());
          await emitGameUpdate(io, roomCode, s);
          io.to(roomCode).emit('game:over', {
            winnerId: winner.id,
            reason: 'blitz_timeout',
            scores: Object.fromEntries(s.getFullState().players.map(p => [p.id, p.score])),
          });
          turnTimer.stop(roomCode);
        }
      }, blitzLimit * 1000);
    }

    callback?.({ success: true, gameState: session.getPlayerView(data.user.userId) });
  });
}

export function startTurnTimer(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
) {
  const state = session.getFullState();
  const phase = state.phase;

  if (phase === 'challenging' || phase === 'choosing_color' || phase === 'choosing_swap_target') {
    const timeLimit = state.settings.turnTimeLimit;
    turnTimer.start(roomCode, timeLimit, async (code) => {
      const s = sessions.get(code);
      if (!s) return;
      const currentPlayerId = s.getCurrentPlayerId();
      if (s.getFullState().phase === 'challenging') {
        s.applyAction({ type: 'ACCEPT', playerId: currentPlayerId });
      } else if (s.getFullState().phase === 'choosing_color') {
        s.applyAction({ type: 'CHOOSE_COLOR', playerId: currentPlayerId, color: 'red' });
      } else if (s.getFullState().phase === 'choosing_swap_target') {
        const targets = s.getFullState().players.filter(p => p.id !== currentPlayerId && !p.eliminated);
        if (targets.length > 0) {
          s.applyAction({ type: 'CHOOSE_SWAP_TARGET', playerId: currentPlayerId, targetId: targets[0]!.id });
        }
      }
      await saveGameState(redis, code, s.getFullState());
      emitGameUpdate(io, code, s);
      io.to(code).emit('player:timeout', { playerId: currentPlayerId });
      startTurnTimer(io, redis, code, s, turnTimer, sessions);
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
  turnTimer.start(roomCode, timeLimit, async (code) => {
    const s = sessions.get(code);
    if (!s) return;
    const currentPlayerId = s.getCurrentPlayerId();
    s.applyAction({ type: 'DRAW_CARD', playerId: currentPlayerId });
    s.applyAction({ type: 'PASS', playerId: currentPlayerId });
    await saveGameState(redis, code, s.getFullState());
    emitGameUpdate(io, code, s);
    io.to(code).emit('player:timeout', { playerId: currentPlayerId });
    startTurnTimer(io, redis, code, s, turnTimer, sessions);
  });
}

export async function emitGameUpdate(
  io: SocketIOServer,
  roomCode: string,
  session: GameSession,
) {
  const sockets = await io.in(roomCode).fetchSockets();
  for (const s of sockets) {
    const userId = (s.data as SocketData).user.userId;
    s.emit('game:update', session.getPlayerView(userId));
  }
}

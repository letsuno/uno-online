import type { Socket, Server as SocketIOServer } from 'socket.io';
import type Redis from 'ioredis';
import type { Color } from '@uno-online/shared';
import { GameSession } from '../game/game-session.js';
import { saveGameState } from '../game/game-store.js';
import { emitGameUpdate, startTurnTimer } from './room-events.js';
import type { TurnTimer } from '../game/turn-timer.js';
import type { TokenPayload } from '../auth/jwt.js';
import { recordGameResult } from '../db/user-repo.js';

interface SocketData {
  user: TokenPayload;
  roomCode: string | null;
}

function getSession(socket: Socket, sessions: Map<string, GameSession>): { session: GameSession; roomCode: string } | null {
  const roomCode = (socket.data as SocketData).roomCode;
  if (!roomCode) return null;
  const session = sessions.get(roomCode);
  if (!session) return null;
  return { session, roomCode };
}

const persistedGames = new Map<string, number>();

async function persistGameResult(roomCode: string, session: GameSession, startTime: number): Promise<void> {
  const key = `${roomCode}:${session.getFullState().roundNumber}`;
  if (persistedGames.has(key)) return;
  persistedGames.set(key, Date.now());

  const state = session.getFullState();
  if (!state.winnerId) return;

  const duration = Math.floor((Date.now() - startTime) / 1000);
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const playerResults = sorted.map((p, i) => ({
    userId: p.id,
    finalScore: p.score,
    placement: i + 1,
  }));

  try {
    await recordGameResult(roomCode, state.winnerId, state.roundNumber, duration, playerResults);
    setTimeout(() => persistedGames.delete(key), 60_000);
  } catch {
    persistedGames.delete(key);
  }
}

const gameStartTimes = new Map<string, number>();

export function setGameStartTime(roomCode: string): void {
  gameStartTimes.set(roomCode, Date.now());
}

export function registerGameEvents(
  socket: Socket,
  io: SocketIOServer,
  redis: Redis,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
) {
  const data = socket.data as SocketData;

  socket.on('game:play_card', async (payload: { cardId: string; chosenColor?: Color }, callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: 'No active game' });
    const { session, roomCode } = ctx;
    const result = session.applyAction({
      type: 'PLAY_CARD',
      playerId: data.user.userId,
      cardId: payload.cardId,
      chosenColor: payload.chosenColor,
    });
    if (!result.success) {
      socket.emit('game:action_rejected', { action: 'play_card', reason: result.error });
      return callback?.({ success: false, error: result.error });
    }
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session);
    const state = session.getFullState();
    if (state.phase === 'round_end' || state.phase === 'game_over') {
      turnTimer.stop(roomCode);
      io.to(roomCode).emit(state.phase === 'game_over' ? 'game:over' : 'game:round_end', {
        winnerId: state.winnerId,
        scores: Object.fromEntries(state.players.map((p) => [p.id, p.score])),
      });
      if (state.phase === 'game_over') {
        await persistGameResult(roomCode, session, gameStartTimes.get(roomCode) ?? Date.now());
        gameStartTimes.delete(roomCode);
      }
    } else {
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    }
    callback?.({ success: true });
  });

  socket.on('game:draw_card', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'DRAW_CARD', playerId: data.user.userId });
    if (!result.success) {
      socket.emit('game:action_rejected', { action: 'draw_card', reason: result.error });
      return callback?.({ success: false, error: result.error });
    }
    const gameState = session.getFullState();
    if (result.drawnCard && !gameState.settings.houseRules.blindDraw) {
      socket.emit('game:card_drawn', { card: result.drawnCard });
    }
    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      if ((s.data as SocketData).user.userId !== data.user.userId) {
        s.emit('game:opponent_drew', { playerId: data.user.userId });
      }
    }
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session);
    callback?.({ success: true });
  });

  socket.on('game:pass', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'PASS', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session);
    startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    callback?.({ success: true });
  });

  socket.on('game:call_uno', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    session.applyAction({ type: 'CALL_UNO', playerId: data.user.userId });
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session);
    callback?.({ success: true });
  });

  socket.on('game:catch_uno', async (payload: { targetPlayerId: string }, callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    session.applyAction({ type: 'CATCH_UNO', catcherId: data.user.userId, targetId: payload.targetPlayerId });
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session);
    callback?.({ success: true });
  });

  socket.on('game:challenge', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'CHALLENGE', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session);
    startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    callback?.({ success: true });
  });

  socket.on('game:accept', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'ACCEPT', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session);
    startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    callback?.({ success: true });
  });

  socket.on('game:choose_color', async (payload: { color: Color }, callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({
      type: 'CHOOSE_COLOR',
      playerId: data.user.userId,
      color: payload.color,
    });
    if (!result.success) return callback?.({ success: false, error: result.error });
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session);
    const state = session.getFullState();
    if (state.phase === 'challenging') {
      turnTimer.stop(roomCode);
    } else {
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    }
    callback?.({ success: true });
  });

  socket.on('game:choose_swap_target', async (payload: { targetId: string }, callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: 'No active game' });
    const { session, roomCode } = ctx;
    const result = session.applyAction({
      type: 'CHOOSE_SWAP_TARGET',
      playerId: data.user.userId,
      targetId: payload.targetId,
    });
    if (!result.success) return callback?.({ success: false, error: result.error });
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session);
    startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    callback?.({ success: true });
  });

  socket.on('chat:message', (payload: { text: string }) => {
    const roomCode = data.roomCode;
    if (!roomCode || !payload.text) return;
    const text = payload.text.slice(0, 500);
    io.to(roomCode).emit('chat:message', {
      userId: data.user.userId,
      username: data.user.username,
      text,
      timestamp: Date.now(),
    });
  });

  socket.on('game:next_round', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: 'No active game' });
    const { session, roomCode } = ctx;
    if (!session.isRoundEnd()) {
      return callback?.({ success: false, error: 'Round is not over' });
    }
    session.startNextRound();
    await saveGameState(redis, roomCode, session.getFullState());
    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      const userId = (s.data as SocketData).user.userId;
      s.emit('game:state', session.getPlayerView(userId));
    }
    startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    callback?.({ success: true });
  });

  socket.on('game:rematch', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: 'No active game' });
    const { session, roomCode } = ctx;
    if (!session.isGameOver()) {
      return callback?.({ success: false, error: 'Game is not over' });
    }
    session.resetForRematch();
    sessions.set(roomCode, session);
    await saveGameState(redis, roomCode, session.getFullState());
    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      const userId = (s.data as SocketData).user.userId;
      s.emit('game:state', session.getPlayerView(userId));
    }
    startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    callback?.({ success: true });
  });
}

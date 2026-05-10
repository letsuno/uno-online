import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import type { Color } from '@uno-online/shared';
import { GameEventType } from '@uno-online/shared';
import type { Kysely } from 'kysely';
import type { Database } from '../db/database';
import { GameSession } from '../plugins/core/game/session';
import { saveGameState } from '../plugins/core/game/state-store';
import { emitGameUpdate, startTurnTimer } from './room-events';
import type { TurnTimer } from '../plugins/core/game/turn-timer';
import { recordGameResult } from '../db/user-repo';
import { saveGameEvents, saveDeckInfo } from '../plugins/core/game-history/service';
import { getRoom, setRoomStatus, touchRoomActivity } from '../plugins/core/room/store';
import type { SocketData } from './types';

function getSession(socket: Socket, sessions: Map<string, GameSession>): { session: GameSession; roomCode: string } | null {
  const data = socket.data as SocketData;
  if ((data as any).isSpectator) return null;
  const roomCode = data.roomCode;
  if (!roomCode) return null;
  const session = sessions.get(roomCode);
  if (!session) return null;
  return { session, roomCode };
}

const persistedGames = new Map<string, number>();

let persistEnabled = true;
export function setGamePersistence(enabled: boolean): void {
  persistEnabled = enabled;
}

async function persistGameResult(roomCode: string, session: GameSession, startTime: number, db: Kysely<Database>): Promise<void> {
  if (!persistEnabled) return;

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
    const gameId = await recordGameResult(roomCode, state.winnerId, state.roundNumber, duration, playerResults);
    const events = session.getEvents();
    await saveGameEvents(db, gameId, events);
    await saveDeckInfo(db, gameId, state.deckHash, session.getInitialDeckSerialized());
    session.clearEvents();
    setTimeout(() => persistedGames.delete(key), 60_000);
  } catch {
    persistedGames.delete(key);
  }
}

const chatTimestamps = new Map<string, number[]>();
const CHAT_LIMIT = 10;
const CHAT_WINDOW_MS = 5000;

function checkChatRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = chatTimestamps.get(userId) ?? [];
  const recent = timestamps.filter(t => now - t < CHAT_WINDOW_MS);
  if (recent.length >= CHAT_LIMIT) return false;
  recent.push(now);
  chatTimestamps.set(userId, recent);
  return true;
}

const gameStartTimes = new Map<string, number>();
const nextRoundVotes = new Map<string, Set<string>>();

interface NextRoundVoteState {
  votes: number;
  required: number;
  voters: string[];
}

export function setGameStartTime(roomCode: string): void {
  gameStartTimes.set(roomCode, Date.now());
}

function getNextRoundVoteState(roomCode: string, session: GameSession): NextRoundVoteState {
  const voters = [...(nextRoundVotes.get(roomCode) ?? new Set<string>())];
  const playerCount = session.getFullState().players.length;
  return {
    votes: voters.length,
    required: Math.floor(playerCount / 2) + 1,
    voters,
  };
}

async function startNextRound(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
): Promise<void> {
  nextRoundVotes.delete(roomCode);
  session.startNextRound();
  await touchRoomActivity(redis, roomCode);
  await saveGameState(redis, roomCode, session.getFullState());
  io.to(roomCode).emit('game:next_round_vote', { votes: 0, required: Math.floor(session.getFullState().players.length / 2) + 1, voters: [] });
  const sockets = await io.in(roomCode).fetchSockets();
  for (const s of sockets) {
    const userId = (s.data as SocketData).user.userId;
    s.emit('game:state', session.getPlayerView(userId));
  }
  startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
}

async function emitTerminalStateIfNeeded(
  io: SocketIOServer,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  redis: KvStore,
  db: Kysely<Database>,
): Promise<boolean> {
  const state = session.getFullState();
  if (state.phase !== 'round_end' && state.phase !== 'game_over') return false;

  turnTimer.stop(roomCode);
  io.to(roomCode).emit(state.phase === 'game_over' ? 'game:over' : 'game:round_end', {
    winnerId: state.winnerId,
    scores: Object.fromEntries(state.players.map((p) => [p.id, p.score])),
  });

  if (state.phase === 'round_end') {
    const scores = Object.fromEntries(state.players.map((p) => [p.id, p.score]));
    nextRoundVotes.delete(roomCode);
    io.to(roomCode).emit('game:next_round_vote', getNextRoundVoteState(roomCode, session));
    session.recordEvent(GameEventType.ROUND_END, { winnerId: state.winnerId!, scores }, null);
  }

  if (state.phase === 'game_over') {
    const finalScores = Object.fromEntries(state.players.map((p) => [p.id, p.score]));
    session.recordEvent(GameEventType.GAME_OVER, { winnerId: state.winnerId!, finalScores }, null);
    await setRoomStatus(redis, roomCode, 'finished');
    await touchRoomActivity(redis, roomCode);
    await persistGameResult(roomCode, session, gameStartTimes.get(roomCode) ?? Date.now(), db);
    gameStartTimes.delete(roomCode);
  }

  return true;
}

export function registerGameEvents(
  socket: Socket,
  io: SocketIOServer,
  redis: KvStore,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  db: Kysely<Database>,
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
    const playedCard = session.getFullState().discardPile.at(-1);
    session.recordEvent(GameEventType.PLAY_CARD, {
      cardId: payload.cardId,
      card: playedCard!,
      chosenColor: payload.chosenColor,
    }, data.user.userId);
    await touchRoomActivity(redis, roomCode);
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session, redis);
    if (!(await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, db))) {
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    }
    callback?.({ success: true });
  });

  socket.on('game:draw_card', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const beforeState = session.getFullState();
    const result = session.applyAction({ type: 'DRAW_CARD', playerId: data.user.userId });
    if (!result.success) {
      socket.emit('game:action_rejected', { action: 'draw_card', reason: result.error });
      return callback?.({ success: false, error: result.error });
    }
    if (result.drawnCard) {
      session.recordEvent(GameEventType.DRAW_CARD, { card: result.drawnCard }, data.user.userId);
    }
    await touchRoomActivity(redis, roomCode);
    const gameState = session.getFullState();
    if (result.drawnCard && !gameState.settings.houseRules.blindDraw) {
      socket.emit('game:card_drawn', { card: result.drawnCard });
    }
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session, redis);
    const afterState = session.getFullState();
    if (
      (beforeState.pendingPenaltyDraws ?? 0) > 0 &&
      (afterState.pendingPenaltyDraws ?? 0) === 0 &&
      !(await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, db))
    ) {
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    }
    callback?.({ success: true });
  });

  socket.on('game:pass', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'PASS', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    session.recordEvent(GameEventType.PASS, {}, data.user.userId);
    await touchRoomActivity(redis, roomCode);
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session, redis);
    startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    callback?.({ success: true });
  });

  socket.on('game:call_uno', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'CALL_UNO', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    session.recordEvent(GameEventType.CALL_UNO, {}, data.user.userId);
    await touchRoomActivity(redis, roomCode);
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session, redis);
    if (await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, db)) {
      return callback?.({ success: true });
    }
    callback?.({ success: true });
  });

  socket.on('game:catch_uno', async (payload: { targetPlayerId: string }, callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'CATCH_UNO', catcherId: data.user.userId, targetId: payload.targetPlayerId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    session.recordEvent(GameEventType.CATCH_UNO, { targetPlayerId: payload.targetPlayerId }, data.user.userId);
    await touchRoomActivity(redis, roomCode);
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session, redis);
    callback?.({ success: true });
  });

  socket.on('game:challenge', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'CHALLENGE', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    const challengeState = session.getFullState();
    session.recordEvent(GameEventType.CHALLENGE, {
      success: challengeState.lastAction?.type === 'CHALLENGE' ? challengeState.lastAction.succeeded ?? false : false,
      penaltyCards: [],
    }, data.user.userId);
    await touchRoomActivity(redis, roomCode);
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session, redis);
    if (!(await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, db))) {
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    }
    callback?.({ success: true });
  });

  socket.on('game:accept', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'ACCEPT', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    session.recordEvent(GameEventType.ACCEPT, { drawnCards: [] }, data.user.userId);
    await touchRoomActivity(redis, roomCode);
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session, redis);
    if (!(await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, db))) {
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    }
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
    session.recordEvent(GameEventType.CHOOSE_COLOR, { color: payload.color }, data.user.userId);
    await touchRoomActivity(redis, roomCode);
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session, redis);
    if (await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, db)) {
      // terminal state already emitted
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
    session.recordEvent(GameEventType.CHOOSE_SWAP_TARGET, { targetId: payload.targetId }, data.user.userId);
    await touchRoomActivity(redis, roomCode);
    await saveGameState(redis, roomCode, session.getFullState());
    await emitGameUpdate(io, roomCode, session, redis);
    startTurnTimer(io, redis, roomCode, session, turnTimer, sessions);
    callback?.({ success: true });
  });

  socket.on('chat:message', (payload: { text: string }) => {
    const roomCode = data.roomCode;
    if (!roomCode || !payload.text) return;

    if (!checkChatRateLimit(data.user.userId)) {
      socket.emit('chat:rate_limited', { message: '发言太快，请稍后再试' });
      return;
    }

    const text = payload.text.slice(0, 500);
    touchRoomActivity(redis, roomCode).catch(() => {});
    io.to(roomCode).emit('chat:message', {
      userId: data.user.userId,
      nickname: data.user.nickname,
      text,
      timestamp: Date.now(),
      role: data.user.role ?? 'normal',
    });
  });

  socket.on('game:next_round', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: 'No active game' });
    const { session, roomCode } = ctx;
    if (!session.isRoundEnd()) {
      return callback?.({ success: false, error: 'Round is not over' });
    }

    const room = await getRoom(redis, roomCode);
    if (room?.ownerId === data.user.userId) {
      await startNextRound(io, redis, roomCode, session, turnTimer, sessions);
      return callback?.({ success: true, started: true });
    }

    const playerIds = new Set(session.getFullState().players.map((p) => p.id));
    if (!playerIds.has(data.user.userId)) {
      return callback?.({ success: false, error: 'Player not in game' });
    }

    const votes = nextRoundVotes.get(roomCode) ?? new Set<string>();
    votes.add(data.user.userId);
    nextRoundVotes.set(roomCode, votes);

    const voteState = getNextRoundVoteState(roomCode, session);
    io.to(roomCode).emit('game:next_round_vote', voteState);

    if (voteState.votes >= voteState.required) {
      await startNextRound(io, redis, roomCode, session, turnTimer, sessions);
      return callback?.({ success: true, started: true, vote: voteState });
    }

    callback?.({ success: true, started: false, vote: voteState });
  });

  socket.on('game:rematch', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: 'No active game' });
    const { session, roomCode } = ctx;
    if (!session.isGameOver()) {
      return callback?.({ success: false, error: 'Game is not over' });
    }
    nextRoundVotes.delete(roomCode);
    session.resetForRematch();
    sessions.set(roomCode, session);
    await setRoomStatus(redis, roomCode, 'playing');
    await touchRoomActivity(redis, roomCode);
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

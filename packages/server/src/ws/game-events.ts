import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import type { ChatMessage, Color, GameAction } from '@uno-online/shared';
import { chooseAutopilotJumpInAction } from '@uno-online/shared';
import { GameSession } from '../plugins/core/game/session.js';
import type { GameStatePersister } from '../plugins/core/game/state-store.js';
import { emitGameUpdate, setAutopilotActionHandler, startTurnTimer, resetPlayerTimeout, clearRoomTimeouts } from './room-events.js';
import type { TurnTimer } from '../plugins/core/game/turn-timer.js';
import { getRoom, getRoomPlayers, setRoomStatus, touchRoomActivity, removePlayerFromRoom, addPlayerToRoom, resetAllPlayersReady, setUserRoom, setPlayerSpectator } from '../plugins/core/room/store.js';
import { MAX_PLAYERS } from '@uno-online/shared';
import { addSpectator, removeSpectator, clearRoomSpectators, broadcastSpectatorList } from '../plugins/core/spectate/ws.js';
import { broadcastLobbyRooms } from '../plugins/core/spectate/routes.js';
import type { SocketData } from './types.js';

function getSession(socket: Socket, sessions: Map<string, GameSession>): { session: GameSession; roomCode: string } | null {
  const data = socket.data as SocketData;
  if ((data as any).isSpectator) return null;
  const roomCode = data.roomCode;
  if (!roomCode) return null;
  const session = sessions.get(roomCode);
  if (!session) return null;
  return { session, roomCode };
}

const chatTimestamps = new Map<string, number[]>();
const CHAT_LIMIT = 10;
const CHAT_WINDOW_MS = 5000;

export function clearChatTimestamps(userId: string): void {
  chatTimestamps.delete(userId);
}

function checkChatRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = chatTimestamps.get(userId) ?? [];
  const recent = timestamps.filter(t => now - t < CHAT_WINDOW_MS);
  if (recent.length >= CHAT_LIMIT) return false;
  recent.push(now);
  chatTimestamps.set(userId, recent);
  return true;
}

function buildChatMessage(user: SocketData['user'], text: string, isSpectator = false): ChatMessage {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    userId: user.userId,
    nickname: user.nickname,
    text,
    timestamp: Date.now(),
    role: user.role ?? 'normal',
    isSpectator: isSpectator || undefined,
  };
}

const nextRoundVotes = new Map<string, Set<string>>();
const roundEndTimestamps = new Map<string, number>();
const NEXT_ROUND_COOLDOWN_MS = 10_000;
const pendingSpectatorJoins = new Map<string, Map<string, { userId: string; nickname: string; avatarUrl?: string | null; role?: string; isBot?: boolean; socketId: string }>>();
const AUTOPILOT_JUMP_IN_DELAY_MS = 2_000;
const autopilotJumpInTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getPendingSpectatorQueue(roomCode: string): string[] {
  const pending = pendingSpectatorJoins.get(roomCode);
  if (!pending) return [];
  return [...pending.values()].map((p) => p.nickname);
}

export function removePendingSpectatorJoin(roomCode: string, userId: string): boolean {
  const pending = pendingSpectatorJoins.get(roomCode);
  if (!pending) return false;
  const removed = pending.delete(userId);
  if (pending.size === 0) pendingSpectatorJoins.delete(roomCode);
  return removed;
}

export function clearPendingSpectatorJoins(roomCode: string): void {
  pendingSpectatorJoins.delete(roomCode);
}

interface NextRoundVoteState {
  votes: number;
  required: number;
  voters: string[];
}

export function addAutopilotVote(roomCode: string, playerId: string, session: GameSession, io: SocketIOServer): void {
  if (!session.isRoundEnd()) return;
  const votes = nextRoundVotes.get(roomCode) ?? new Set<string>();
  votes.add(playerId);
  nextRoundVotes.set(roomCode, votes);
  const voteState = getNextRoundVoteState(roomCode, session);
  io.to(roomCode).emit('game:next_round_vote', voteState);
}

export function removePlayerVote(roomCode: string, playerId: string, session: GameSession, io: SocketIOServer): void {
  const votes = nextRoundVotes.get(roomCode);
  if (votes) votes.delete(playerId);
  if (session.isRoundEnd()) {
    const voteState = getNextRoundVoteState(roomCode, session);
    io.to(roomCode).emit('game:next_round_vote', voteState);
  }
}

function clearAutopilotJumpIn(roomCode: string): void {
  const timer = autopilotJumpInTimers.get(roomCode);
  if (!timer) return;
  clearTimeout(timer);
  autopilotJumpInTimers.delete(roomCode);
}

function handleAutopilotAction(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  action: GameAction,
  persister: GameStatePersister,
): void {
  if (action.type === 'PLAY_CARD') {
    scheduleAutopilotJumpIn(io, redis, roomCode, session, turnTimer, sessions, persister);
  }
}

function scheduleAutopilotJumpIn(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
): void {
  clearAutopilotJumpIn(roomCode);

  const snapshot = session.getFullState();
  if (!snapshot.settings.houseRules.jumpIn || snapshot.phase !== 'playing') return;
  const topCardId = snapshot.discardPile.at(-1)?.id;
  if (!topCardId) return;

  const timer = setTimeout(async () => {
    autopilotJumpInTimers.delete(roomCode);
    const currentSession = sessions.get(roomCode);
    if (!currentSession) return;

    const state = currentSession.getFullState();
    if (state.phase !== 'playing' || state.discardPile.at(-1)?.id !== topCardId) return;

    let jumpInActions: GameAction[] | null = null;
    const jumper = state.players.find((player) => {
      if (!player.autopilot || player.eliminated) return false;
      const actions = chooseAutopilotJumpInAction(state, player.id);
      if (actions.length > 0) {
        jumpInActions = actions;
        return true;
      }
      return false;
    });
    if (!jumper || !jumpInActions) return;

    let acted = false;
    for (const action of jumpInActions as GameAction[]) {
      const result = currentSession.applyAction(action);
      if (result.success) {
        acted = true;
      }
    }
    if (!acted) return;

    persister.markDirty(roomCode, currentSession.getFullState());
    await Promise.all([
      touchRoomActivity(redis, roomCode),
      emitGameUpdate(io, roomCode, currentSession, redis),
    ]);

    if (!(await emitTerminalStateIfNeeded(io, roomCode, currentSession, turnTimer, redis, sessions, persister))) {
      scheduleAutopilotJumpIn(io, redis, roomCode, currentSession, turnTimer, sessions, persister);
      startTurnTimer(io, redis, roomCode, currentSession, turnTimer, sessions, persister);
    }
  }, AUTOPILOT_JUMP_IN_DELAY_MS);

  timer.unref?.();
  autopilotJumpInTimers.set(roomCode, timer);
}

function getNextRoundVoteState(roomCode: string, session: GameSession): NextRoundVoteState {
  const playerIds = new Set(session.getFullState().players.map((p) => p.id));
  const voters = [...(nextRoundVotes.get(roomCode) ?? new Set<string>())].filter((id) => playerIds.has(id));
  return {
    votes: voters.length,
    required: playerIds.size,
    voters,
  };
}

export function getRoundEndAt(roomCode: string): number | null {
  return roundEndTimestamps.get(roomCode) ?? null;
}

export function getRoundEndVoteState(roomCode: string, session: GameSession): NextRoundVoteState | null {
  if (!session.isRoundEnd()) return null;
  return getNextRoundVoteState(roomCode, session);
}

async function processPendingSpectatorJoins(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
): Promise<void> {
  const pending = pendingSpectatorJoins.get(roomCode);
  if (!pending || pending.size === 0) return;

  const joined: string[] = [];
  const userRoomWrites: Promise<void>[] = [];
  for (const [userId, info] of pending) {
    if (session.getPlayerCount() >= MAX_PLAYERS) break;
    if (session.getFullState().players.some((p) => p.id === userId)) {
      joined.push(userId);
      continue;
    }

    const sock = io.sockets.sockets.get(info.socketId);
    if (sock) (sock.data as SocketData).isSpectator = false;

    removeSpectator(roomCode, userId);
    session.addPlayer({
      id: userId,
      name: info.nickname,
      avatarUrl: info.avatarUrl,
      role: info.role as any,
      isBot: info.isBot,
    });
    await addPlayerToRoom(redis, roomCode, {
      userId,
      nickname: info.nickname,
      avatarUrl: info.avatarUrl,
      role: info.role,
      isBot: info.isBot,
    });
    userRoomWrites.push(setUserRoom(redis, userId, roomCode));
    joined.push(userId);
  }
  await Promise.all(userRoomWrites);

  for (const id of joined) pending.delete(id);

  if (pending.size === 0) {
    pendingSpectatorJoins.delete(roomCode);
  } else {
    io.to(roomCode).emit('game:spectator_queue', {
      queue: [...pending.values()].map((p) => p.nickname),
      nickname: '',
      joined: true,
    });
  }

  // removeSpectator above is silent; without this broadcast the client's
  // spectator panel would keep showing the just-promoted users.
  if (joined.length > 0) {
    broadcastSpectatorList(io, roomCode);
  }
}

async function startNextRound(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
): Promise<void> {
  nextRoundVotes.delete(roomCode);
  roundEndTimestamps.delete(roomCode);
  await processPendingSpectatorJoins(io, redis, roomCode, session);
  session.startNextRound();
  persister.markDirty(roomCode, session.getFullState());
  await Promise.all([
    touchRoomActivity(redis, roomCode),
    persister.flushNow(roomCode),
  ]);
  io.to(roomCode).emit('game:next_round_vote', { votes: 0, required: session.getFullState().players.length, voters: [] });
  const room = await getRoom(redis, roomCode);
  const spectatorMode = (room?.settings?.spectatorMode as 'full' | 'hidden') ?? 'hidden';
  const sockets = await io.in(roomCode).fetchSockets();
  for (const s of sockets) {
    const sData = s.data as SocketData;
    if (sData.isSpectator) {
      s.emit('game:state', session.getSpectatorView(spectatorMode));
    } else {
      s.emit('game:state', session.getPlayerView(sData.user.userId));
    }
  }
  startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
}

async function emitTerminalStateIfNeeded(
  io: SocketIOServer,
  roomCode: string,
  session: GameSession,
  turnTimer: TurnTimer,
  redis: KvStore,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
): Promise<boolean> {
  const state = session.getFullState();
  if (state.phase !== 'round_end' && state.phase !== 'game_over') return false;

  await persister.flushNow(roomCode);

  turnTimer.stop(roomCode);
  clearRoomTimeouts(roomCode);

  // Capture a single timestamp for this terminal-state transition so the event
  // payload and the in-memory cooldown anchor stay in sync. This is the
  // authoritative "round ended at" / "game over at" moment.
  const terminalAt = Date.now();
  roundEndTimestamps.set(roomCode, terminalAt);

  const baseScores = Object.fromEntries(state.players.map((p) => [p.id, p.score]));
  if (state.phase === 'game_over') {
    io.to(roomCode).emit('game:over', {
      winnerId: state.winnerId,
      scores: baseScores,
      gameOverAt: terminalAt,
    });
  } else {
    io.to(roomCode).emit('game:round_end', {
      winnerId: state.winnerId,
      scores: baseScores,
      roundEndAt: terminalAt,
    });
  }

  if (state.phase === 'round_end') {
    nextRoundVotes.delete(roomCode);

    const connectedAutopilotIds = state.players.filter((p) => p.autopilot && p.connected).map((p) => p.id);
    if (connectedAutopilotIds.length > 0) {
      const votes = nextRoundVotes.get(roomCode) ?? new Set<string>();
      for (const id of connectedAutopilotIds) votes.add(id);
      nextRoundVotes.set(roomCode, votes);
    }

    const voteState = getNextRoundVoteState(roomCode, session);
    io.to(roomCode).emit('game:next_round_vote', voteState);
  }

  if (state.phase === 'game_over') {
    await Promise.all([
      setRoomStatus(redis, roomCode, 'finished'),
      touchRoomActivity(redis, roomCode),
    ]);
    session.clearChatHistory();
    await persister.flushNow(roomCode);
    io.to(roomCode).emit('chat:cleared');
  }

  return true;
}

let autopilotHandlerSet = false;

export function registerGameEvents(
  socket: Socket,
  io: SocketIOServer,
  redis: KvStore,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
) {
  if (!autopilotHandlerSet) {
    autopilotHandlerSet = true;
    setAutopilotActionHandler((roomCode, session, action) => {
      handleAutopilotAction(io, redis, roomCode, session, turnTimer, sessions, action, persister);
    });
  }

  const data = socket.data as SocketData;
  const initialSession = data.roomCode ? sessions.get(data.roomCode) : null;
  if (initialSession) {
    socket.emit('chat:history', initialSession.getChatHistory());
  }

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
    resetPlayerTimeout(roomCode, data.user.userId);
    persister.markDirty(roomCode, session.getFullState());
    await Promise.all([
      touchRoomActivity(redis, roomCode),
      emitGameUpdate(io, roomCode, session, redis),
    ]);
    if (!(await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, sessions, persister))) {
      scheduleAutopilotJumpIn(io, redis, roomCode, session, turnTimer, sessions, persister);
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
    }
    callback?.({ success: true });
  });

  socket.on('game:draw_card', async (payload: { side?: string }, callback) => {
    const side = payload?.side;
    if (side !== 'left' && side !== 'right') {
      return callback?.({ success: false, error: 'invalid side' });
    }
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const beforeState = session.getFullState();
    const result = session.applyAction({ type: 'DRAW_CARD', playerId: data.user.userId, side });
    if (!result.success) {
      socket.emit('game:action_rejected', { action: 'draw_card', reason: result.error });
      return callback?.({ success: false, error: result.error });
    }
    resetPlayerTimeout(roomCode, data.user.userId);
    const gameState = session.getFullState();
    if (result.drawnCard && !gameState.settings.houseRules.blindDraw) {
      socket.emit('game:card_drawn', { card: result.drawnCard });
    }
    persister.markDirty(roomCode, session.getFullState());
    await Promise.all([
      touchRoomActivity(redis, roomCode),
      emitGameUpdate(io, roomCode, session, redis),
    ]);
    const afterState = session.getFullState();
    if (
      (beforeState.pendingPenaltyDraws ?? 0) > 0 &&
      (afterState.pendingPenaltyDraws ?? 0) === 0 &&
      !(await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, sessions, persister))
    ) {
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
    }
    callback?.({ success: true });
  });

  socket.on('game:pass', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'PASS', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    resetPlayerTimeout(roomCode, data.user.userId);
    persister.markDirty(roomCode, session.getFullState());
    await Promise.all([
      touchRoomActivity(redis, roomCode),
      emitGameUpdate(io, roomCode, session, redis),
    ]);
    startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
    callback?.({ success: true });
  });

  socket.on('game:call_uno', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'CALL_UNO', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    persister.markDirty(roomCode, session.getFullState());
    await Promise.all([
      touchRoomActivity(redis, roomCode),
      emitGameUpdate(io, roomCode, session, redis),
    ]);
    if (await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, sessions, persister)) {
      return callback?.({ success: true });
    }
    callback?.({ success: true });
  });

  socket.on('game:catch_uno', async (payload: { targetPlayerId: string }, callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });
    const session = sessions.get(roomCode);
    if (!session) return callback?.({ success: false });
    const result = session.applyAction({ type: 'CATCH_UNO', catcherId: data.user.userId, targetId: payload.targetPlayerId, catcherName: data.user.nickname });
    if (!result.success) return callback?.({ success: false, error: result.error });
    persister.markDirty(roomCode, session.getFullState());
    await Promise.all([
      touchRoomActivity(redis, roomCode),
      emitGameUpdate(io, roomCode, session, redis),
    ]);
    callback?.({ success: true });
  });

  socket.on('game:challenge', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'CHALLENGE', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    resetPlayerTimeout(roomCode, data.user.userId);
    persister.markDirty(roomCode, session.getFullState());
    await Promise.all([
      touchRoomActivity(redis, roomCode),
      emitGameUpdate(io, roomCode, session, redis),
    ]);
    if (!(await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, sessions, persister))) {
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
    }
    callback?.({ success: true });
  });

  socket.on('game:accept', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false });
    const { session, roomCode } = ctx;
    const result = session.applyAction({ type: 'ACCEPT', playerId: data.user.userId });
    if (!result.success) return callback?.({ success: false, error: result.error });
    resetPlayerTimeout(roomCode, data.user.userId);
    persister.markDirty(roomCode, session.getFullState());
    await Promise.all([
      touchRoomActivity(redis, roomCode),
      emitGameUpdate(io, roomCode, session, redis),
    ]);
    if (!(await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, sessions, persister))) {
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
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
    resetPlayerTimeout(roomCode, data.user.userId);
    persister.markDirty(roomCode, session.getFullState());
    await Promise.all([
      touchRoomActivity(redis, roomCode),
      emitGameUpdate(io, roomCode, session, redis),
    ]);
    if (await emitTerminalStateIfNeeded(io, roomCode, session, turnTimer, redis, sessions, persister)) {
      // terminal state already emitted
    } else {
      scheduleAutopilotJumpIn(io, redis, roomCode, session, turnTimer, sessions, persister);
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
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
    resetPlayerTimeout(roomCode, data.user.userId);
    persister.markDirty(roomCode, session.getFullState());
    await Promise.all([
      touchRoomActivity(redis, roomCode),
      emitGameUpdate(io, roomCode, session, redis),
    ]);
    startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
    callback?.({ success: true });
  });

  socket.on('chat:message', (payload: { text: string }) => {
    const roomCode = data.roomCode;
    if (!roomCode || !payload.text) return;
    const session = sessions.get(roomCode);
    if (!session) return;

    if (!checkChatRateLimit(data.user.userId)) {
      socket.emit('chat:rate_limited', { message: '发言太快，请稍后再试' });
      return;
    }

    const text = payload.text.trim().slice(0, 500);
    if (!text) return;

    const message = buildChatMessage(data.user, text, data.isSpectator);
    session.addChatMessage(message);
    touchRoomActivity(redis, roomCode).catch(() => {});
    persister.markDirty(roomCode, session.getFullState());
    io.to(roomCode).emit('chat:message', message);
  });

  socket.on('game:next_round', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: 'No active game' });
    const { session, roomCode } = ctx;
    if (!session.isRoundEnd()) {
      return callback?.({ success: false, error: 'Round is not over' });
    }

    const playerIds = new Set(session.getFullState().players.map((p) => p.id));
    const room = await getRoom(redis, roomCode);
    const isOwner = room?.ownerId === data.user.userId;
    // Players can always vote. The owner can also vote/trigger the next round
    // even while sitting on the spectator bench (not in session.players).
    if (!playerIds.has(data.user.userId) && !isOwner) {
      return callback?.({ success: false, error: 'Player not in game' });
    }
    const votes = nextRoundVotes.get(roomCode) ?? new Set<string>();
    const hadAlreadyVoted = votes.has(data.user.userId);
    votes.add(data.user.userId);
    nextRoundVotes.set(roomCode, votes);

    const voteState = getNextRoundVoteState(roomCode, session);
    io.to(roomCode).emit('game:next_round_vote', voteState);

    if (isOwner && hadAlreadyVoted && voteState.votes >= voteState.required) {
      const endedAt = roundEndTimestamps.get(roomCode);
      if (endedAt && Date.now() - endedAt < NEXT_ROUND_COOLDOWN_MS) {
        return callback?.({ success: true, started: false, vote: voteState });
      }
      await startNextRound(io, redis, roomCode, session, turnTimer, sessions, persister);
      return callback?.({ success: true, started: true, vote: voteState });
    }

    callback?.({ success: true, started: false, vote: voteState });
  });

  socket.on('game:spectator_join', async (callback) => {
    const roomCode = data.roomCode;
    if (!roomCode || !data.isSpectator) return callback?.({ success: false, error: '非观众' });
    const session = sessions.get(roomCode);
    if (!session) return callback?.({ success: false, error: '游戏会话不存在' });
    if (session.getFullState().players.some((p) => p.id === data.user.userId)) {
      return callback?.({ success: false, error: '已在游戏中' });
    }

    if (!pendingSpectatorJoins.has(roomCode)) pendingSpectatorJoins.set(roomCode, new Map());
    const pending = pendingSpectatorJoins.get(roomCode)!;

    if (pending.has(data.user.userId)) {
      pending.delete(data.user.userId);
      callback?.({ success: true, queued: false });
    } else {
      const currentCount = session.getPlayerCount();
      const queuedCount = pending.size;
      if (currentCount + queuedCount >= MAX_PLAYERS) {
        return callback?.({ success: false, error: `房间人数已达上限 (${MAX_PLAYERS})，无法排队` });
      }
      pending.set(data.user.userId, {
        userId: data.user.userId,
        nickname: data.user.nickname,
        avatarUrl: data.user.avatarUrl,
        role: data.user.role,
        isBot: data.user.isBot,
        socketId: socket.id,
      });
      callback?.({ success: true, queued: true });
    }

    const joined = pending.has(data.user.userId);
    io.to(roomCode).emit('game:spectator_queue', {
      queue: [...pending.values()].map((p) => p.nickname),
      nickname: data.user.nickname,
      joined,
    });
  });

  socket.on('game:kick_player', async (payload: { targetId?: string }, callback) => {
    const targetId = payload?.targetId;
    if (!targetId) return callback?.({ success: false, error: '缺少目标玩家' });

    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: 'No active game' });
    const { session, roomCode } = ctx;

    if (!session.isRoundEnd()) {
      return callback?.({ success: false, error: '只能在回合结束阶段踢人' });
    }

    const room = await getRoom(redis, roomCode);
    if (room?.ownerId !== data.user.userId) {
      return callback?.({ success: false, error: '只有房主可以踢人' });
    }

    if (targetId === data.user.userId) {
      return callback?.({ success: false, error: '不能踢自己' });
    }

    const voters = nextRoundVotes.get(roomCode) ?? new Set<string>();
    if (voters.has(targetId)) {
      return callback?.({ success: false, error: '该玩家已准备，无法踢出' });
    }

    const state = session.getFullState();
    if (!state.players.some((p) => p.id === targetId)) {
      return callback?.({ success: false, error: '玩家不在游戏中' });
    }

    const targetPlayer = state.players.find((p) => p.id === targetId);
    session.removePlayer(targetId);
    await removePlayerFromRoom(redis, roomCode, targetId);

    const targetSockets = await io.in(roomCode).fetchSockets();
    for (const s of targetSockets) {
      if ((s.data as SocketData).user.userId === targetId) {
        (s.data as SocketData).isSpectator = true;
        s.emit('game:kicked', { reason: '你已被房主移至观战席', toSpectator: true });
      }
    }
    if (targetPlayer) addSpectator(roomCode, targetId, targetPlayer.name, targetPlayer.avatarUrl);

    voters.delete(targetId);
    const voteState = getNextRoundVoteState(roomCode, session);
    io.to(roomCode).emit('game:next_round_vote', voteState);

    persister.markDirty(roomCode, session.getFullState());
    await Promise.all([
      persister.flushNow(roomCode),
      emitGameUpdate(io, roomCode, session, redis),
    ]);
    broadcastSpectatorList(io, roomCode);
    io.to(roomCode).emit('room:updated', { players: state.players.filter((p) => p.id !== targetId).map((p) => ({ userId: p.id, name: p.name })) });

    callback?.({ success: true });
  });

  socket.on('game:leave_to_spectate', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: 'No active game' });
    const { session, roomCode } = ctx;

    if (!session.isRoundEnd()) {
      return callback?.({ success: false, error: '只能在回合结束阶段切换观战' });
    }

    const state = session.getFullState();
    const player = state.players.find((p) => p.id === data.user.userId);
    if (!player) return callback?.({ success: false, error: '玩家不在游戏中' });

    session.removePlayer(data.user.userId);
    await removePlayerFromRoom(redis, roomCode, data.user.userId);

    (socket.data as SocketData).isSpectator = true;
    addSpectator(roomCode, data.user.userId, player.name, data.user.avatarUrl);

    const voters = nextRoundVotes.get(roomCode) ?? new Set<string>();
    voters.delete(data.user.userId);
    const voteState = getNextRoundVoteState(roomCode, session);
    io.to(roomCode).emit('game:next_round_vote', voteState);

    persister.markDirty(roomCode, session.getFullState());
    await Promise.all([
      persister.flushNow(roomCode),
      emitGameUpdate(io, roomCode, session, redis),
    ]);
    broadcastSpectatorList(io, roomCode);
    io.to(roomCode).emit('room:updated', { players: state.players.filter((p) => p.id !== data.user.userId).map((p) => ({ userId: p.id, name: p.name })) });

    callback?.({ success: true });
  });

  socket.on('game:back_to_room', async (callback) => {
    const ctx = getSession(socket, sessions);
    if (!ctx) return callback?.({ success: false, error: 'No active game' });
    const { session, roomCode } = ctx;
    if (!session.isGameOver()) {
      return callback?.({ success: false, error: 'Game is not over' });
    }
    const room = await getRoom(redis, roomCode);
    if (room?.ownerId !== data.user.userId) {
      return callback?.({ success: false, error: '只有房主可以返回房间' });
    }
    const endedAt = roundEndTimestamps.get(roomCode);
    if (endedAt && Date.now() - endedAt < NEXT_ROUND_COOLDOWN_MS) {
      const remaining = Math.ceil((NEXT_ROUND_COOLDOWN_MS - (Date.now() - endedAt)) / 1000);
      return callback?.({ success: false, error: `请等待 ${remaining} 秒后再操作` });
    }

    nextRoundVotes.delete(roomCode);
    roundEndTimestamps.delete(roomCode);
    sessions.delete(roomCode);
    persister.cleanup(roomCode);
    turnTimer.stop(roomCode);
    clearRoomTimeouts(roomCode);
    // Leftover opt-ins from the previous game would otherwise be re-applied
    // with stale socket ids → ghost players.
    clearPendingSpectatorJoins(roomCode);

    await setRoomStatus(redis, roomCode, 'waiting');
    await resetAllPlayersReady(redis, roomCode);

    const currentRoomPlayers = await getRoomPlayers(redis, roomCode);
    const currentIds = new Set(currentRoomPlayers.map((p) => p.userId));
    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      const sData = s.data as SocketData;
      if (sData.isSpectator && !currentIds.has(sData.user.userId)) {
        await addPlayerToRoom(redis, roomCode, {
          userId: sData.user.userId,
          nickname: sData.user.nickname,
          avatarUrl: sData.user.avatarUrl,
          role: sData.user.role,
          isBot: sData.user.isBot,
        });
        await setPlayerSpectator(redis, roomCode, sData.user.userId, true);
      }
      sData.isSpectator = false;
    }
    clearRoomSpectators(roomCode);

    await touchRoomActivity(redis, roomCode);
    const players = await getRoomPlayers(redis, roomCode);
    const updatedRoom = await getRoom(redis, roomCode);
    io.to(roomCode).emit('game:back_to_room', { players, room: updatedRoom });
    io.to(roomCode).emit('chat:cleared');
    broadcastSpectatorList(io, roomCode);
    broadcastLobbyRooms(redis, io);
    callback?.({ success: true });
  });
}

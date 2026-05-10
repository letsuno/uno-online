import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { Kysely } from 'kysely';
import type { KvStore } from '../kv/types.js';
import type { GameAction, GameState, RoomSettings } from '@uno-online/shared';
import { MIN_PLAYERS, DEFAULT_HOUSE_RULES, chooseAutopilotAction, GameEventType } from '@uno-online/shared';
import type { Database } from '../db/database';
import { RoomManager } from '../plugins/core/room/manager';
import { getRoom, getRoomPlayers, setRoomSettings, setRoomStatus, touchRoomActivity } from '../plugins/core/room/store';
import { GameSession } from '../plugins/core/game/session';
import type { GameStatePersister } from '../plugins/core/game/state-store';
import type { TurnTimer } from '../plugins/core/game/turn-timer';
import { setGameStartTime, removePlayerVote } from './game-events';
import type { SocketData } from './types';
import { dissolveRoom } from './room-lifecycle';
import { removeVoicePresence } from './voice-presence';
import { getAutopilotActionPlayerId } from './autopilot-action-player';

const DRAW_PENALTY_PAUSE_MS = 500;
const AUTO_AUTOPILOT_THRESHOLD = 2;
type AutopilotActionHandler = (roomCode: string, session: GameSession, action: GameAction) => void;

// Track consecutive timeouts per player per room
const timeoutCounts = new Map<string, Map<string, number>>();
const blitzTimers = new Map<string, ReturnType<typeof setTimeout>>();
let autopilotActionHandler: AutopilotActionHandler | null = null;

export function setAutopilotActionHandler(handler: AutopilotActionHandler | null): void {
  autopilotActionHandler = handler;
}

export function notifyAutopilotAction(roomCode: string, session: GameSession, action: GameAction): void {
  autopilotActionHandler?.(roomCode, session, action);
}

export function getTimeoutCounts(): Map<string, Map<string, number>> {
  return timeoutCounts;
}

export function resetPlayerTimeout(roomCode: string, playerId: string): void {
  const roomCounts = timeoutCounts.get(roomCode);
  if (roomCounts) roomCounts.delete(playerId);
}

export function clearRoomTimeouts(roomCode: string): void {
  timeoutCounts.delete(roomCode);
  const blitzTimer = blitzTimers.get(roomCode);
  if (blitzTimer) {
    clearTimeout(blitzTimer);
    blitzTimers.delete(roomCode);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function shouldPauseAfterAction(before: GameState, session: GameSession, action: GameAction): boolean {
  if (action.type === 'DRAW_CARD' && (before.pendingPenaltyDraws ?? 0) > 0) return true;
  if (action.type !== 'PLAY_CARD') return false;
  const topCard = session.getFullState().discardPile.at(-1);
  return topCard?.type === 'draw_two' || topCard?.type === 'wild_draw_four';
}

export function registerRoomEvents(
  socket: Socket,
  io: SocketIOServer,
  redis: KvStore,
  roomManager: RoomManager,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  db: Kysely<Database>,
  persister: GameStatePersister,
) {
  const data = socket.data as SocketData;

  socket.on('room:create', async (settings: Partial<RoomSettings>, callback) => {
    const roomSettings: RoomSettings = {
      turnTimeLimit: settings?.turnTimeLimit ?? 30,
      targetScore: settings?.targetScore ?? 500,
      houseRules: settings?.houseRules ?? DEFAULT_HOUSE_RULES,
      allowSpectators: settings?.allowSpectators ?? true,
      spectatorMode: settings?.spectatorMode ?? 'hidden',
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
      await touchRoomActivity(redis, roomCode);
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
    if (data.isSpectator) {
      socket.to(roomCode).emit('room:spectator_left', {
        nickname: data.user.nickname,
      });
      socket.leave(roomCode);
      data.roomCode = null;
      data.isSpectator = false;
      return callback?.({ success: true });
    }
    const room = await getRoom(redis, roomCode);
    if (room?.ownerId === data.user.userId) {
      await dissolveRoom(io, redis, roomCode, sessions, turnTimer, persister, 'host_closed', db);
      return callback?.({ success: true, dissolved: true });
    }
    const { deleted } = await roomManager.leaveRoom(roomCode, data.user.userId);
    removeVoicePresence(io, roomCode, data.user.userId);
    socket.leave(roomCode);
    data.roomCode = null;

    const session = sessions.get(roomCode);
    if (session && !deleted) {
      session.removePlayer(data.user.userId);
      removePlayerVote(roomCode, data.user.userId, session, io);

      if (session.getPlayerCount() < MIN_PLAYERS) {
        const st = session.getFullState();
        const lastPlayer = st.players[0];
        if (lastPlayer) session.forceGameOver(lastPlayer.id);
        turnTimer.stop(roomCode);
        io.to(roomCode).emit('game:over', {
          winnerId: lastPlayer?.id ?? null,
          scores: Object.fromEntries(st.players.map((p) => [p.id, p.score])),
        });
      }

      persister.markDirty(roomCode, session.getFullState());
      await persister.flushNow(roomCode);
      await emitGameUpdate(io, roomCode, session, redis);
    }

    if (!deleted) {
      const updatedRoom = await getRoom(redis, roomCode);
      const players = await getRoomPlayers(redis, roomCode);
      io.to(roomCode).emit('room:updated', { players, room: updatedRoom });
    } else {
      sessions.delete(roomCode);
      turnTimer.stop(roomCode);
    }
    callback?.({ success: true });
  });

  socket.on('room:ready', async (ready: boolean, callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });
    await roomManager.setReady(roomCode, data.user.userId, ready);
    await touchRoomActivity(redis, roomCode);
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
      allowSpectators: settings.allowSpectators ?? room.settings.allowSpectators ?? true,
      spectatorMode: settings.spectatorMode ?? room.settings.spectatorMode ?? 'hidden',
    };

    await setRoomSettings(redis, roomCode, nextSettings);
    await touchRoomActivity(redis, roomCode);
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
    await dissolveRoom(io, redis, roomCode, sessions, turnTimer, persister, 'host_closed', db);
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
    await touchRoomActivity(redis, roomCode);
    const session = GameSession.create(
      players.map((p) => ({ id: p.userId, name: p.nickname, avatarUrl: p.avatarUrl ?? null, role: p.role as import('@uno-online/shared').UserRole | undefined })),
      { turnTimeLimit: room.settings?.turnTimeLimit ?? 30, targetScore: room.settings?.targetScore ?? 500, houseRules: room.settings?.houseRules ?? DEFAULT_HOUSE_RULES, allowSpectators: room.settings?.allowSpectators ?? true, spectatorMode: room.settings?.spectatorMode ?? 'hidden' } as RoomSettings,
    );
    sessions.set(roomCode, session);
    setGameStartTime(roomCode);
    const fullState = session.getFullState();
    session.recordEvent(GameEventType.GAME_START, {
      initialDeck: [...fullState.deckLeft, ...fullState.deckRight],
      deckHash: fullState.deckHash,
      playerHands: Object.fromEntries(fullState.players.map(p => [p.id, p.hand])),
      firstDiscard: fullState.discardPile[0]!,
      direction: fullState.direction,
      settings: fullState.settings,
    }, null);
    persister.markDirty(roomCode, session.getFullState());
    await persister.flushNow(roomCode);

    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      const userId = (s.data as SocketData).user.userId;
      s.emit('game:state', session.getPlayerView(userId));
    }

    startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);

    // Blitz mode: total game time limit
    const blitzLimit = session.getFullState().settings.houseRules.blitzTimeLimit;
    if (blitzLimit) {
      const blitzTimer = setTimeout(async () => {
        blitzTimers.delete(roomCode);
        const s = sessions.get(roomCode);
        if (!s || s.isGameOver() || s.isRoundEnd()) return;
        // Find player with fewest cards
        const state = s.getFullState();
        const minCards = Math.min(...state.players.map(p => p.hand.length));
        const winner = state.players.find(p => p.hand.length === minCards);
        if (winner) {
          s.forceGameOver(winner.id);
          persister.markDirty(roomCode, s.getFullState());
          await persister.flushNow(roomCode);
          await emitGameUpdate(io, roomCode, s, redis);
          io.to(roomCode).emit('game:over', {
            winnerId: winner.id,
            reason: 'blitz_timeout',
            scores: Object.fromEntries(s.getFullState().players.map(p => [p.id, p.score])),
          });
          turnTimer.stop(roomCode);
        }
      }, blitzLimit * 1000);
      blitzTimer.unref?.();
      blitzTimers.set(roomCode, blitzTimer);
    }

    callback?.({ success: true, gameState: session.getPlayerView(data.user.userId) });
  });
}

export async function executeAutopilot(
  session: GameSession,
  playerId: string,
  onPenaltyPause?: () => void | Promise<void>,
  onActionSuccess?: (action: GameAction) => void | Promise<void>,
): Promise<boolean> {
  let acted = false;
  for (let round = 0; round < 5; round++) {
    if (!canAutopilotActForPlayer(session, playerId)) break;

    const st = session.getFullState();
    const actions = chooseAutopilotAction(st, playerId);
    if (actions.length === 0) break;
    let anySuccess = false;
    for (const action of actions) {
      const beforeAction = session.getFullState();
      const result = session.applyAction(action);
      if (result.success) {
        anySuccess = true;
        await onActionSuccess?.(action);
        if (shouldPauseAfterAction(beforeAction, session, action)) {
          await onPenaltyPause?.();
          await sleep(DRAW_PENALTY_PAUSE_MS);
        }
      }
    }
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
  const state = session.getFullState();
  const phase = state.phase;
  const immediateAutopilotPlayerId = getImmediateAutopilotPlayerId(state);

  if (immediateAutopilotPlayerId) {
    turnTimer.start(roomCode, 2, async (code) => {
      const s = sessions.get(code);
      if (!s) return;
      const pid = getImmediateAutopilotPlayerId(s.getFullState());
      if (!pid) {
        startTurnTimer(io, redis, code, s, turnTimer, sessions, persister);
        return;
      }
      await executeAutopilot(s, pid, async () => {
        persister.markDirty(code, s.getFullState());
        await emitGameUpdate(io, code, s, redis);
      }, (action) => notifyAutopilotAction(code, s, action));
      persister.markDirty(code, s.getFullState());
      await emitGameUpdate(io, code, s, redis);
      startTurnTimer(io, redis, code, s, turnTimer, sessions, persister);
    });
    return;
  }

  if (phase === 'challenging' || phase === 'choosing_color' || phase === 'choosing_swap_target') {
    const timeLimit = state.settings.houseRules.fastMode
      ? Math.floor(state.settings.turnTimeLimit / 2)
      : state.settings.turnTimeLimit;
    turnTimer.start(roomCode, timeLimit, async (code) => {
      const s = sessions.get(code);
      if (!s) return;
      const pid = getAutopilotActionPlayerId(s.getFullState());
      if (!pid) {
        startTurnTimer(io, redis, code, s, turnTimer, sessions, persister);
        return;
      }
      await executeAutopilot(s, pid, async () => {
        persister.markDirty(code, s.getFullState());
        await emitGameUpdate(io, code, s, redis);
      }, (action) => notifyAutopilotAction(code, s, action));
      persister.markDirty(code, s.getFullState());
      await emitGameUpdate(io, code, s, redis);
      io.to(code).emit('player:timeout', { playerId: pid });
      incrementTimeoutAndAutoAutopilot(io, redis, code, s, pid, persister);
      startTurnTimer(io, redis, code, s, turnTimer, sessions, persister);
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
    const pid = getAutopilotActionPlayerId(s.getFullState());
    if (!pid) {
      startTurnTimer(io, redis, code, s, turnTimer, sessions, persister);
      return;
    }
    await executeAutopilot(s, pid, async () => {
      persister.markDirty(code, s.getFullState());
      await emitGameUpdate(io, code, s, redis);
    }, (action) => notifyAutopilotAction(code, s, action));
    persister.markDirty(code, s.getFullState());
    await emitGameUpdate(io, code, s, redis);
    io.to(code).emit('player:timeout', { playerId: pid });
    incrementTimeoutAndAutoAutopilot(io, redis, code, s, pid, persister);
    startTurnTimer(io, redis, code, s, turnTimer, sessions, persister);
  });
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
    await emitGameUpdate(io, roomCode, session, redis);
    io.to(roomCode).emit('player:autopilot', { playerId, enabled: true });
  }
}

export async function emitGameUpdate(
  io: SocketIOServer,
  roomCode: string,
  session: GameSession,
  kv?: KvStore,
) {
  const sockets = await io.in(roomCode).fetchSockets();
  let spectatorMode: 'full' | 'hidden' = 'hidden';
  if (kv) {
    if (session.getFullState().phase === 'game_over') {
      await setRoomStatus(kv, roomCode, 'finished');
    }
    const room = await getRoom(kv, roomCode);
    if (room) spectatorMode = (room.settings?.spectatorMode as 'full' | 'hidden') ?? 'hidden';
  }

  const { baseView, hands } = session.getGameUpdateBatch();
  const threshold = baseView.settings?.houseRules?.handRevealThreshold ?? null;

  for (const s of sockets) {
    const sData = s.data as SocketData;
    if (sData.isSpectator) {
      if (spectatorMode === 'full') {
        const fullView = {
          ...baseView,
          viewerId: '__spectator__',
          players: baseView.players.map(p => ({ ...p, hand: hands.get(p.id) ?? [] })),
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
            return { ...p, hand: hands.get(p.id) ?? [] };
          }
          if (threshold !== null && p.handCount > 0 && p.handCount <= threshold) {
            return { ...p, hand: hands.get(p.id) ?? [] };
          }
          return p;
        }),
      };
      s.emit('game:update', playerView);
    }
  }
}

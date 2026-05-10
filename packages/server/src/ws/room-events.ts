import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { Kysely } from 'kysely';
import type { KvStore } from '../kv/types.js';
import type { GameAction, GameState, RoomSettings } from '@uno-online/shared';
import { MIN_PLAYERS, DEFAULT_HOUSE_RULES, chooseAutopilotAction, GameEventType } from '@uno-online/shared';
import type { Database } from '../db/database';
import { RoomManager } from '../plugins/core/room/manager';
import { getRoom, getRoomPlayers, setRoomSettings, setRoomStatus, touchRoomActivity } from '../plugins/core/room/store';
import { GameSession } from '../plugins/core/game/session';
import { saveGameState } from '../plugins/core/game/state-store';
import type { TurnTimer } from '../plugins/core/game/turn-timer';
import { setGameStartTime } from './game-events';
import type { SocketData } from './types';
import { dissolveRoom } from './room-lifecycle';
import { removeVoicePresence } from './voice-presence';

const DRAW_PENALTY_PAUSE_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canAutopilotActForPlayer(session: GameSession, playerId: string): boolean {
  const state = session.getFullState();
  if (state.phase === 'round_end' || state.phase === 'game_over') return false;
  if (state.phase === 'challenging') return state.pendingDrawPlayerId === playerId;
  return state.players[state.currentPlayerIndex]?.id === playerId;
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
      await dissolveRoom(io, redis, roomCode, sessions, turnTimer, 'host_closed', db);
      return callback?.({ success: true, dissolved: true });
    }
    const { deleted } = await roomManager.leaveRoom(roomCode, data.user.userId);
    removeVoicePresence(io, roomCode, data.user.userId);
    socket.leave(roomCode);
    data.roomCode = null;
    if (!deleted) {
      const room = await getRoom(redis, roomCode);
      const players = await getRoomPlayers(redis, roomCode);
      io.to(roomCode).emit('room:updated', { players, room });
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
    await dissolveRoom(io, redis, roomCode, sessions, turnTimer, 'host_closed', db);
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
          await emitGameUpdate(io, roomCode, s, redis);
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

export async function executeAutopilot(
  session: GameSession,
  playerId: string,
  onPenaltyPause?: () => void | Promise<void>,
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
) {
  const state = session.getFullState();
  const phase = state.phase;
  const currentPlayer = state.players[state.currentPlayerIndex];

  if (currentPlayer?.autopilot) {
    turnTimer.start(roomCode, 2, async (code) => {
      const s = sessions.get(code);
      if (!s) return;
      const pid = s.getCurrentPlayerId();
      await executeAutopilot(s, pid, async () => {
        await saveGameState(redis, code, s.getFullState());
        await emitGameUpdate(io, code, s, redis);
      });
      await saveGameState(redis, code, s.getFullState());
      emitGameUpdate(io, code, s, redis);
      startTurnTimer(io, redis, code, s, turnTimer, sessions);
    });
    return;
  }

  if (phase === 'challenging' || phase === 'choosing_color' || phase === 'choosing_swap_target') {
    const timeLimit = state.settings.turnTimeLimit;
    turnTimer.start(roomCode, timeLimit, async (code) => {
      const s = sessions.get(code);
      if (!s) return;
      const pid = s.getFullState().pendingDrawPlayerId ?? s.getCurrentPlayerId();
      await executeAutopilot(s, pid, async () => {
        await saveGameState(redis, code, s.getFullState());
        await emitGameUpdate(io, code, s, redis);
      });
      await saveGameState(redis, code, s.getFullState());
      emitGameUpdate(io, code, s, redis);
      io.to(code).emit('player:timeout', { playerId: pid });
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
    const pid = s.getCurrentPlayerId();
    await executeAutopilot(s, pid, async () => {
      await saveGameState(redis, code, s.getFullState());
      await emitGameUpdate(io, code, s, redis);
    });
    await saveGameState(redis, code, s.getFullState());
    emitGameUpdate(io, code, s, redis);
    io.to(code).emit('player:timeout', { playerId: pid });
    startTurnTimer(io, redis, code, s, turnTimer, sessions);
  });
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
    if (room) spectatorMode = room.settings.spectatorMode ?? 'hidden';
  }
  for (const s of sockets) {
    const sData = s.data as SocketData;
    if (sData.isSpectator) {
      s.emit('game:update', session.getSpectatorView(spectatorMode));
    } else {
      s.emit('game:update', session.getPlayerView(sData.user.userId));
    }
  }
}

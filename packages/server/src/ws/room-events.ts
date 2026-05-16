import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import type { GameAction, GameState, RoomSettings, BotDifficulty } from '@uno-online/shared';
import { MIN_PLAYERS, DEFAULT_HOUSE_RULES, chooseAutopilotAction, chooseJumpInAction, chooseBotAction, getPlayableCards, DIFFICULTY_PARAMS, BOT_DIFFICULTIES } from '@uno-online/shared';
import { RoomManager } from '../plugins/core/room/manager.js';
import { getRoom, getRoomSeats, getRoomSpectators, setRoomSettings, setRoomStatus, setRoomOwner, touchRoomActivity, ensureNotInRoom, removeSpectatorFromRoom, clearRoomSpectators, getSeatedPlayers } from '../plugins/core/room/store.js';
import { joinRoomSocket, leaveRoomSocket } from './socket-room.js';
import { GameSession } from '../plugins/core/game/session.js';
import type { GameStatePersister } from '../plugins/core/game/state-store.js';
import type { TurnTimer } from '../plugins/core/game/turn-timer.js';
import type { VoiceChannelManager } from '../voice/channel-manager.js';
import { removePlayerVote, emitTerminalStateIfNeeded, addAutopilotVote } from './game-events.js';
import type { SocketData } from './types.js';
import { dissolveRoom } from './room-lifecycle.js';
import { removeVoicePresence, setForceMuted } from './voice-presence.js';
import { broadcastLobbyRooms } from '../plugins/core/spectate/routes.js';
import { getAutopilotActionPlayerId } from './autopilot-action-player.js';
import { broadcastSpectatorLeft, broadcastSpectatorList } from '../plugins/core/spectate/ws.js';
import { addBot, removeBot, setBotDifficulty, calculateBotDelay } from './bot-manager.js';
import { checkBotUnoCatch, checkBotJumpIn, clearBotTimers } from './bot-uno-watcher.js';

const AUTOPILOT_MIN_ACTION_INTERVAL_MS = 500;
const AUTO_AUTOPILOT_THRESHOLD = 2;
type AutopilotActionHandler = (roomCode: string, session: GameSession, action: GameAction) => void;

// Track consecutive timeouts per player per room
const timeoutCounts = new Map<string, Map<string, number>>();
const blitzTimers = new Map<string, ReturnType<typeof setTimeout>>();
const botTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
  clearBotTurnTimer(roomCode);
  clearBotTimers(roomCode);
}

function clearBotTurnTimer(roomCode: string): void {
  const timer = botTurnTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    botTurnTimers.delete(roomCode);
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


export function registerRoomEvents(
  socket: Socket,
  io: SocketIOServer,
  redis: KvStore,
  roomManager: RoomManager,
  turnTimer: TurnTimer,
  sessions: Map<string, GameSession>,
  persister: GameStatePersister,
  voiceChannels?: VoiceChannelManager,
) {
  const data = socket.data as SocketData;

  socket.on('room:create', async (settings: Partial<RoomSettings>, callback) => {
    const conflict = await ensureNotInRoom(redis, data.user.userId);
    if (conflict) return callback({ success: false, error: conflict });
    const roomSettings: RoomSettings = {
      turnTimeLimit: settings?.turnTimeLimit ?? 30,
      targetScore: settings?.targetScore ?? 1000,
      houseRules: settings?.houseRules ?? DEFAULT_HOUSE_RULES,
      allowSpectators: settings?.allowSpectators ?? true,
      spectatorMode: settings?.spectatorMode ?? 'hidden',
    };
    const code = await roomManager.createRoom(data.user.userId, data.user.nickname, roomSettings, data.user.avatarUrl, data.user.role, data.user.isBot);
    const voiceChannelId = await voiceChannels?.ensureRoomChannel(code) ?? null;
    await joinRoomSocket(redis, socket, code);
    const [room, seats, spectators] = await Promise.all([getRoom(redis, code), getRoomSeats(redis, code), getRoomSpectators(redis, code)]);
    callback({ success: true, roomCode: code, players: getSeatedPlayers(seats), room, voiceChannelId });
    io.to(code).emit('seat:updated', { seats, spectators });
  });

  socket.on('room:join', async (roomCode: string, callback) => {
    try {
      const room = await getRoom(redis, roomCode);
      if (!room) return callback({ success: false, error: 'Room not found' });

      const [seats, spectators] = await Promise.all([getRoomSeats(redis, roomCode), getRoomSpectators(redis, roomCode)]);
      const seatedPlayers = getSeatedPlayers(seats);
      const alreadyInRoom = seatedPlayers.some(p => p.userId === data.user.userId) || spectators.some(s => s.userId === data.user.userId);

      if (alreadyInRoom) {
        await joinRoomSocket(redis, socket, roomCode);
        if (room.status !== 'waiting') {
          socket.emit('room:rejoin_redirect', { roomCode });
        }
        const voiceChannelId = await voiceChannels?.getRoomChannel(roomCode) ?? null;
        return callback({ success: true, players: seatedPlayers, room, rejoin: room.status !== 'waiting', voiceChannelId });
      }

      const conflict = await ensureNotInRoom(redis, data.user.userId, roomCode);
      if (conflict) return callback({ success: false, error: conflict });

      await roomManager.joinRoom(roomCode, data.user.userId, data.user.nickname, data.user.avatarUrl, data.user.role, data.user.isBot);
      await touchRoomActivity(redis, roomCode);
      await joinRoomSocket(redis, socket, roomCode);
      const [voiceChannelId, updatedSeats, updatedSpectators] = await Promise.all([
        voiceChannels?.getRoomChannel(roomCode) ?? null,
        getRoomSeats(redis, roomCode),
        getRoomSpectators(redis, roomCode),
      ]);
      io.to(roomCode).emit('seat:updated', { seats: updatedSeats, spectators: updatedSpectators });
      callback({ success: true, players: getSeatedPlayers(updatedSeats), room, voiceChannelId });
    } catch (err) {
      callback({ success: false, error: (err as Error).message });
    }
  });

  socket.on('room:leave', async (callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });

    const spectators = await getRoomSpectators(redis, roomCode);
    const isRoomSpectator = spectators.some(s => s.userId === data.user.userId) || data.isSpectator;

    if (isRoomSpectator) {
      const { userId, nickname } = data.user;

      const seats = await getRoomSeats(redis, roomCode);
      const seatedPlayers = getSeatedPlayers(seats);
      const hasHumanPlayers = seatedPlayers.some(p => !p.isBot);

      if (seatedPlayers.length === 0 || !hasHumanPlayers) {
        await leaveRoomSocket(redis, socket, roomCode);
        await dissolveRoom(io, redis, roomCode, sessions, turnTimer, persister, 'empty', voiceChannels);
        return callback?.({ success: true, dissolved: true });
      }

      // Transfer ownership if the leaving spectator was the owner
      const room = await getRoom(redis, roomCode);
      if (room?.ownerId === userId) {
        const nextOwner = seatedPlayers.find(p => !p.isBot) ?? spectators.find(s => s.userId !== userId);
        if (nextOwner) {
          await setRoomOwner(redis, roomCode, nextOwner.userId);
        }
        const updatedRoom = await getRoom(redis, roomCode);
        io.to(roomCode).emit('room:updated', { room: updatedRoom });
      }

      await removeSpectatorFromRoom(redis, roomCode, userId);
      await leaveRoomSocket(redis, socket, roomCode);
      await broadcastSpectatorLeft(io, redis, roomCode, userId, nickname);
      const [updatedSeats, updatedSpectators] = await Promise.all([getRoomSeats(redis, roomCode), getRoomSpectators(redis, roomCode)]);
      io.to(roomCode).emit('seat:updated', { seats: updatedSeats, spectators: updatedSpectators });
      return callback?.({ success: true });
    }
    const session = sessions.get(roomCode);

    // During an active game, treat "leave" as a disconnect — mark offline and
    // let the normal timeout → autopilot → removal flow handle it, instead of
    // ripping the player out mid-game.
    if (session) {
      session.setPlayerConnected(data.user.userId, false);
      session.setPlayerAutopilot(data.user.userId, true);
      persister.markDirty(roomCode, session.getFullState());
      await persister.flushNow(roomCode);
      await emitGameUpdate(io, roomCode, session, redis);
      io.to(roomCode).emit('player:disconnected', { playerId: data.user.userId });
      io.to(roomCode).emit('player:autopilot', { playerId: data.user.userId, enabled: true });
      removeVoicePresence(io, roomCode, data.user.userId);
      await leaveRoomSocket(redis, socket, roomCode);
      addAutopilotVote(roomCode, data.user.userId, session, io);
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
      return callback?.({ success: true });
    }

    // No active game — normal leave flow (waiting room)
    const room = await getRoom(redis, roomCode);
    const wasOwner = room?.ownerId === data.user.userId;
    const { deleted } = await roomManager.leaveRoom(roomCode, data.user.userId);
    removeVoicePresence(io, roomCode, data.user.userId);
    await leaveRoomSocket(redis, socket, roomCode);

    if (deleted) {
      await dissolveRoom(io, redis, roomCode, sessions, turnTimer, persister, 'empty', voiceChannels);
      return callback?.({ success: true, dissolved: true });
    }

    const updatedRoom = wasOwner ? await getRoom(redis, roomCode) : room;
    const [seats, updatedSpectators] = await Promise.all([getRoomSeats(redis, roomCode), getRoomSpectators(redis, roomCode)]);
    io.to(roomCode).emit('seat:updated', { seats, spectators: updatedSpectators });
    if (wasOwner) {
      io.to(roomCode).emit('room:updated', { room: updatedRoom });
    }
    callback?.({ success: true });
  });

  socket.on('room:ready', async (ready: boolean, callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false });
    await roomManager.setReady(roomCode, data.user.userId, ready);
    await touchRoomActivity(redis, roomCode);
    const [seats, spectators] = await Promise.all([getRoomSeats(redis, roomCode), getRoomSpectators(redis, roomCode)]);
    io.to(roomCode).emit('seat:updated', { seats, spectators });
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
      targetScore: settings.targetScore ?? room.settings.targetScore ?? 1000,
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
    const updatedRoom = await getRoom(redis, roomCode);
    io.to(roomCode).emit('room:updated', { room: updatedRoom });
    callback?.({ success: true, room: updatedRoom });
  });

  socket.on('room:dissolve', async (callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });
    const room = await getRoom(redis, roomCode);
    if (!room || room.ownerId !== data.user.userId) {
      return callback?.({ success: false, error: 'Only room owner can dissolve' });
    }
    await dissolveRoom(io, redis, roomCode, sessions, turnTimer, persister, 'host_closed', voiceChannels);
    callback?.({ success: true });
  });

  socket.on('room:transfer_owner', async (payload: { targetId: string }, callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
    const room = await getRoom(redis, roomCode);
    if (!room) return callback?.({ success: false, error: '房间不存在' });
    if (room.ownerId !== data.user.userId) return callback?.({ success: false, error: '只有房主可以移交' });
    if (room.status !== 'waiting') return callback?.({ success: false, error: '游戏进行中无法移交房主' });
    if (payload.targetId === data.user.userId) return callback?.({ success: false, error: '不能移交给自己' });
    const [seats, spectators] = await Promise.all([getRoomSeats(redis, roomCode), getRoomSpectators(redis, roomCode)]);
    const allUsers = [...getSeatedPlayers(seats), ...spectators];
    if (!allUsers.some(p => p.userId === payload.targetId)) return callback?.({ success: false, error: '目标玩家不在房间中' });
    await setRoomOwner(redis, roomCode, payload.targetId);
    await touchRoomActivity(redis, roomCode);
    const updatedRoom = await getRoom(redis, roomCode);
    io.to(roomCode).emit('room:updated', { room: updatedRoom });
    io.to(roomCode).emit('seat:updated', { seats, spectators });
    callback?.({ success: true });
  });

  socket.on('room:kick', async (payload: { targetId: string }, callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
    const room = await getRoom(redis, roomCode);
    if (!room) return callback?.({ success: false, error: '房间不存在' });
    if (room.ownerId !== data.user.userId) return callback?.({ success: false, error: '只有房主可以踢人' });
    if (room.status === 'playing') return callback?.({ success: false, error: '游戏进行中无法踢人' });
    if (payload.targetId === data.user.userId) return callback?.({ success: false, error: '不能踢自己' });
    const [seats, spectators] = await Promise.all([getRoomSeats(redis, roomCode), getRoomSpectators(redis, roomCode)]);
    const allUsers = [...getSeatedPlayers(seats), ...spectators];
    if (!allUsers.some(p => p.userId === payload.targetId)) return callback?.({ success: false, error: '目标玩家不在房间中' });
    await roomManager.leaveRoom(roomCode, payload.targetId);
    removeVoicePresence(io, roomCode, payload.targetId);
    const targetSockets = await io.in(roomCode).fetchSockets();
    const cleanups: Promise<void>[] = [];
    for (const s of targetSockets) {
      if ((s.data as SocketData).user.userId === payload.targetId) {
        s.emit('game:kicked', { reason: '你已被房主移出房间' });
        cleanups.push(leaveRoomSocket(redis, s, roomCode));
      }
    }
    await Promise.all(cleanups);
    await touchRoomActivity(redis, roomCode);
    const [updatedSeats, updatedSpectators] = await Promise.all([getRoomSeats(redis, roomCode), getRoomSpectators(redis, roomCode)]);
    const updatedRoom = await getRoom(redis, roomCode);
    io.to(roomCode).emit('seat:updated', { seats: updatedSeats, spectators: updatedSpectators });
    io.to(roomCode).emit('room:updated', { room: updatedRoom });
    callback?.({ success: true });
  });

  socket.on('room:add_bot', async (payload: { difficulty: BotDifficulty; seatIndex?: number }, callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback({ success: false, error: '不在房间中' });
    if (!BOT_DIFFICULTIES.includes(payload.difficulty)) return callback({ success: false, error: '无效的难度等级' });

    const session = sessions.get(roomCode);
    const result = await addBot(io, redis, roomCode, data.user.userId, payload.difficulty, session, payload.seatIndex);

    if (result.success && session) {
      persister.markDirty(roomCode, session.getFullState());
      await emitGameUpdate(io, roomCode, session, redis);
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
    }

    broadcastLobbyRooms(redis, io);
    callback(result);
  });

  socket.on('room:remove_bot', async (payload: { botId: string }, callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback({ success: false, error: '不在房间中' });

    const room = await getRoom(redis, roomCode);
    if (!room || room.ownerId !== data.user.userId) return callback({ success: false, error: '只有房主可以移除人机' });

    const session = sessions.get(roomCode);

    if (session && session.getPlayerCount() - 1 < MIN_PLAYERS) {
      const st = session.getFullState();
      const lastPlayer = st.players.find(p => p.id !== payload.botId);
      if (lastPlayer) {
        session.forceGameOver(lastPlayer.id);
        turnTimer.stop(roomCode);
        session.removePlayer(payload.botId);
        io.to(roomCode).emit('game:over', {
          winnerId: lastPlayer.id,
          scores: Object.fromEntries(st.players.map(p => [p.id, p.score])),
          gameOverAt: Date.now(),
        });
      } else {
        turnTimer.stop(roomCode);
        session.removePlayer(payload.botId);
      }
      await removeBot(io, redis, roomCode, data.user.userId, payload.botId, undefined);
      persister.markDirty(roomCode, session.getFullState());
      await emitGameUpdate(io, roomCode, session, redis);
      broadcastLobbyRooms(redis, io);
      return callback({ success: true });
    }

    const result = await removeBot(io, redis, roomCode, data.user.userId, payload.botId, session);

    if (result.success && session) {
      persister.markDirty(roomCode, session.getFullState());
      await emitGameUpdate(io, roomCode, session, redis);
      startTurnTimer(io, redis, roomCode, session, turnTimer, sessions, persister);
    }

    broadcastLobbyRooms(redis, io);
    callback(result);
  });

  socket.on('room:set_bot_difficulty', async (payload: { botId: string; difficulty: BotDifficulty }, callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback({ success: false, error: '不在房间中' });
    if (!BOT_DIFFICULTIES.includes(payload.difficulty)) return callback({ success: false, error: '无效的难度等级' });

    const session = sessions.get(roomCode);
    const result = await setBotDifficulty(io, redis, roomCode, data.user.userId, payload.botId, payload.difficulty, session);
    callback(result);
  });

  socket.on('voice:force_mute', async (payload: { targetId: string; muted: boolean }, callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: '不在房间中' });
    const room = await getRoom(redis, roomCode);
    if (!room) return callback?.({ success: false, error: '房间不存在' });
    if (room.ownerId !== data.user.userId) return callback?.({ success: false, error: '只有房主可以强制静音' });
    if (payload.targetId === data.user.userId) return callback?.({ success: false, error: '不能静音自己' });
    const [seats, spectators] = await Promise.all([getRoomSeats(redis, roomCode), getRoomSpectators(redis, roomCode)]);
    const allUsers = [...getSeatedPlayers(seats), ...spectators];
    if (!allUsers.some(p => p.userId === payload.targetId)) return callback?.({ success: false, error: '目标玩家不在房间中' });
    setForceMuted(io, roomCode, payload.targetId, payload.muted);
    callback?.({ success: true });
  });

  socket.on('game:start', async (callback) => {
    const roomCode = data.roomCode;
    if (!roomCode) return callback?.({ success: false, error: 'Not in a room' });
    const room = await getRoom(redis, roomCode);
    if (!room || room.ownerId !== data.user.userId) {
      return callback?.({ success: false, error: 'Only room owner can start' });
    }
    const seats = await getRoomSeats(redis, roomCode);
    const spectators = await getRoomSpectators(redis, roomCode);
    const activePlayers = getSeatedPlayers(seats);

    if (activePlayers.length < MIN_PLAYERS) {
      return callback?.({ success: false, error: 'Not enough players' });
    }
    const allReady = await roomManager.areAllReady(roomCode);
    if (!allReady) {
      return callback?.({ success: false, error: 'Not all players are ready' });
    }
    await setRoomStatus(redis, roomCode, 'playing');
    await touchRoomActivity(redis, roomCode);
    const session = GameSession.create(
      activePlayers.map((p) => ({ id: p.userId, name: p.nickname, avatarUrl: p.avatarUrl ?? null, role: p.role as import('@uno-online/shared').UserRole | undefined, isBot: p.isBot, botConfig: p.botConfig })),
      { turnTimeLimit: room.settings?.turnTimeLimit ?? 30, targetScore: room.settings?.targetScore ?? 1000, houseRules: room.settings?.houseRules ?? DEFAULT_HOUSE_RULES, allowSpectators: room.settings?.allowSpectators ?? true, spectatorMode: room.settings?.spectatorMode ?? 'hidden' } as RoomSettings,
    );
    sessions.set(roomCode, session);
    persister.markDirty(roomCode, session.getFullState());
    await persister.flushNow(roomCode);

    const spectatorMode = (room.settings?.spectatorMode as 'full' | 'hidden') ?? 'hidden';
    const sockets = await io.in(roomCode).fetchSockets();
    for (const s of sockets) {
      const sData = s.data as SocketData;
      if (spectators.some(sp => sp.userId === sData.user.userId)) {
        sData.isSpectator = true;
        s.emit('game:state', session.getSpectatorView(spectatorMode));
      } else {
        s.emit('game:state', session.getPlayerView(sData.user.userId));
      }
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
            gameOverAt: Date.now(),
          });
          turnTimer.stop(roomCode);
        }
      }, blitzLimit * 1000);
      blitzTimer.unref?.();
      blitzTimers.set(roomCode, blitzTimer);
    }

    callback?.({ success: true, gameState: session.getPlayerView(data.user.userId) });
    broadcastLobbyRooms(redis, io);
  });
}

export async function executeAutopilot(
  session: GameSession,
  playerId: string,
  onPenaltyPause?: () => void | Promise<void>,
  onActionSuccess?: (action: GameAction) => void | Promise<void>,
): Promise<boolean> {
  let acted = false;
  let lastActionTime = 0;
  for (let round = 0; round < 5; round++) {
    const st = session.getFullState();
    let actions: GameAction[];
    if (canAutopilotActForPlayer(session, playerId)) {
      actions = chooseAutopilotAction(st, playerId);
    } else {
      actions = chooseJumpInAction(st, playerId);
    }
    if (actions.length === 0) break;
    let anySuccess = false;
    for (const action of actions) {
      if (lastActionTime > 0) {
        const elapsed = Date.now() - lastActionTime;
        if (elapsed < AUTOPILOT_MIN_ACTION_INTERVAL_MS) {
          await sleep(AUTOPILOT_MIN_ACTION_INTERVAL_MS - elapsed);
        }
      }
      const result = session.applyAction(action);
      if (result.success) {
        lastActionTime = Date.now();
        anySuccess = true;
        await onActionSuccess?.(action);
        await onPenaltyPause?.();
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

  const actingPlayerId = getAutopilotActionPlayerId(state);
  const actingPlayer = actingPlayerId ? state.players.find(p => p.id === actingPlayerId) : null;
  if (actingPlayer?.isBot && !actingPlayer.autopilot) {
    const botConfig = actingPlayer.botConfig;
    const difficulty = botConfig?.difficulty ?? 'easy';
    const topCard = state.discardPile[state.discardPile.length - 1];
    const playableCount = (state.phase === 'playing' && topCard && state.currentColor)
      ? getPlayableCards(actingPlayer.hand, topCard, state.currentColor).length
      : 0;

    // Fast draw: skip the full thinking delay when the bot has no decision to
    // make and will just draw a card (penalty draws, draw-until-playable loop,
    // or no playable cards at all).
    const hr = state.settings.houseRules;
    const isPenaltyDraw = (state.pendingPenaltyDraws ?? 0) > 0;
    const isDrawLoop = state.phase === 'playing'
      && playableCount === 0
      && state.lastAction?.type === 'DRAW_CARD'
      && state.lastAction.playerId === actingPlayerId
      && (hr.drawUntilPlayable || hr.deathDraw);
    const delayMs = (isPenaltyDraw || isDrawLoop)
      ? 250 + Math.random() * 250
      : calculateBotDelay(difficulty, playableCount);

    turnTimer.stop(roomCode);
    clearBotTurnTimer(roomCode);
    const timer = setTimeout(async () => {
      botTurnTimers.delete(roomCode);
      const s = sessions.get(roomCode);
      if (!s) return;
      const fullState = s.getFullState();
      const pid = getAutopilotActionPlayerId(fullState);
      if (!pid) {
        startTurnTimer(io, redis, roomCode, s, turnTimer, sessions, persister);
        return;
      }

      const botPlayer = fullState.players.find(p => p.id === pid);
      let actions: GameAction[];
      if (botPlayer?.isBot && botPlayer.botConfig) {
        actions = chooseBotAction(fullState, pid);
      } else {
        actions = chooseAutopilotAction(fullState, pid);
      }

      for (const action of actions) {
        const result = s.applyAction(action);
        if (!result.success) break;
        notifyAutopilotAction(roomCode, s, action);
      }

      // Bot UNO call
      if (botPlayer?.isBot && botPlayer.botConfig) {
        const afterState = s.getFullState();
        const afterPlayer = afterState.players.find(p => p.id === pid);
        if (afterPlayer && afterPlayer.hand.length === 1 && !afterPlayer.calledUno) {
          const params = DIFFICULTY_PARAMS[botPlayer.botConfig.difficulty];
          if (Math.random() < params.unoCallRate) {
            s.applyAction({ type: 'CALL_UNO', playerId: pid });
          }
        }
      }

      persister.markDirty(roomCode, s.getFullState());
      await emitGameUpdate(io, roomCode, s, redis);

      if (await emitTerminalStateIfNeeded(io, roomCode, s, turnTimer, redis, sessions, persister)) {
        return;
      }

      checkBotUnoCatch(io, redis, roomCode, s, persister, emitGameUpdate, sessions);
      const jumpInScheduled = checkBotJumpIn(io, redis, roomCode, s, persister, emitGameUpdate, () => {
        startTurnTimer(io, redis, roomCode, s, turnTimer, sessions, persister);
      }, sessions);
      if (!jumpInScheduled) {
        startTurnTimer(io, redis, roomCode, s, turnTimer, sessions, persister);
      }
    }, delayMs);
    timer.unref?.();
    botTurnTimers.set(roomCode, timer);
    return;
  }

  const immediateAutopilotPlayerId = getImmediateAutopilotPlayerId(state);

  if (immediateAutopilotPlayerId) {
    turnTimer.start(roomCode, 1, async (code) => {
      const s = sessions.get(code);
      if (!s) return;
      const pid = getImmediateAutopilotPlayerId(s.getFullState());
      if (!pid) {
        startTurnTimer(io, redis, code, s, turnTimer, sessions, persister);
        return;
      }
      await executeAutopilot(s, pid, async () => {
        persister.markDirty(code, s.getFullState());
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

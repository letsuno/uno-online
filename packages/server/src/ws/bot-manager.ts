import { randomUUID } from 'node:crypto';
import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import type { BotDifficulty, BotPersonality } from '@uno-online/shared';
import { pickBotName, DIFFICULTY_PARAMS, BOT_PERSONALITIES } from '@uno-online/shared';
import type { BotConfig } from '@uno-online/shared';
import { getRoomSeats, getRoom, takeSeat, clearSeatByUserId, getFirstEmptySeatIndex, getSeatedPlayers, setSeatPlayerBotConfig, getRoomSpectators } from '../plugins/core/room/store.js';
import type { RoomSeatPlayer } from '../plugins/core/room/store.js';
import type { GameSession } from '../plugins/core/game/session.js';

/**
 * Calculate simulated thinking delay for a bot based on difficulty and
 * the number of playable cards in its hand.
 */
export function calculateBotDelay(difficulty: BotDifficulty, playableCount: number): number {
  const { base, perCard, maxDelay } = DIFFICULTY_PARAMS[difficulty].delay;
  const baseDelay = base[0] + Math.random() * (base[1] - base[0]);
  return Math.min(baseDelay + perCard * playableCount, maxDelay);
}

/**
 * Add a bot player to a room.
 *
 * Validates ownership and capacity, picks a unique name and random
 * personality, then either joins the waiting room store or adds the bot
 * to an in-progress game session.
 */
export async function addBot(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  requesterId: string,
  difficulty: BotDifficulty,
  session?: GameSession,
  targetSeatIndex?: number,
): Promise<{ success: true; botId: string } | { success: false; error: string }> {
  const room = await getRoom(redis, roomCode);
  if (!room) return { success: false, error: '房间不存在' };
  if (room.ownerId !== requesterId) return { success: false, error: '只有房主可以添加机器人' };

  const seats = await getRoomSeats(redis, roomCode);
  const seatIndex = targetSeatIndex !== undefined && targetSeatIndex >= 0 && targetSeatIndex < seats.length && seats[targetSeatIndex] === null
    ? targetSeatIndex
    : getFirstEmptySeatIndex(seats);
  if (seatIndex === -1) return { success: false, error: '没有空座位' };

  const botId = `bot_${randomUUID()}`;
  const usedNames = new Set(getSeatedPlayers(seats).map((p) => p.nickname));
  const name = pickBotName(usedNames);
  const personality: BotPersonality =
    BOT_PERSONALITIES[Math.floor(Math.random() * BOT_PERSONALITIES.length)]!;
  const botConfig: BotConfig = { difficulty, personality };

  const botPlayer: RoomSeatPlayer = {
    userId: botId,
    nickname: name,
    avatarUrl: null,
    ready: true,
    connected: true,
    role: 'normal',
    isBot: true,
    botConfig,
  };

  if (room.status === 'waiting') {
    await takeSeat(redis, roomCode, seatIndex, botPlayer);
  } else if (session) {
    // Game in progress: take seat and add to the live session.
    await takeSeat(redis, roomCode, seatIndex, botPlayer);
    session.addPlayer({ id: botId, name, avatarUrl: null, isBot: true, botConfig }, true);
  } else {
    return { success: false, error: '游戏进行中，无法添加机器人' };
  }

  const [updatedSeats, spectators] = await Promise.all([
    getRoomSeats(redis, roomCode),
    getRoomSpectators(redis, roomCode),
  ]);

  io.to(roomCode).emit('seat:updated', { seats: updatedSeats, spectators });
  io.to(roomCode).emit('room:bot_added', { botId, name, difficulty, personality });

  return { success: true, botId };
}

/**
 * Remove a bot player from a room.
 *
 * Validates ownership and that the target is actually a bot, then removes
 * it from the session (if active) and the room store.
 */
export async function removeBot(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  requesterId: string,
  botId: string,
  session?: GameSession,
): Promise<{ success: true } | { success: false; error: string }> {
  const room = await getRoom(redis, roomCode);
  if (!room) return { success: false, error: '房间不存在' };
  if (room.ownerId !== requesterId) return { success: false, error: '只有房主可以移除机器人' };

  const seats = await getRoomSeats(redis, roomCode);
  const target = seats.find((s) => s !== null && s.userId === botId);
  if (!target) return { success: false, error: '机器人不在房间中' };
  if (!target.isBot) return { success: false, error: '目标玩家不是机器人' };

  if (session) {
    session.removePlayer(botId);
  }
  await clearSeatByUserId(redis, roomCode, botId);

  const [updatedSeats, spectators] = await Promise.all([
    getRoomSeats(redis, roomCode),
    getRoomSpectators(redis, roomCode),
  ]);

  io.to(roomCode).emit('seat:updated', { seats: updatedSeats, spectators });
  io.to(roomCode).emit('room:bot_removed', { botId });

  return { success: true };
}

/**
 * Update a bot's difficulty setting.
 */
export async function setBotDifficulty(
  io: SocketIOServer,
  redis: KvStore,
  roomCode: string,
  requesterId: string,
  botId: string,
  difficulty: BotDifficulty,
  session?: GameSession,
): Promise<{ success: true } | { success: false; error: string }> {
  const room = await getRoom(redis, roomCode);
  if (!room) return { success: false, error: '房间不存在' };
  if (room.ownerId !== requesterId) return { success: false, error: '只有房主可以修改机器人难度' };

  const seats = await getRoomSeats(redis, roomCode);
  const target = seats.find((s) => s !== null && s.userId === botId);
  if (!target || !target.isBot) return { success: false, error: '目标不是人机' };

  // Persist to KV store
  const newBotConfig: BotConfig = {
    difficulty,
    personality: target.botConfig?.personality ?? 'balanced',
  };
  await setSeatPlayerBotConfig(redis, roomCode, botId, newBotConfig);

  if (session) {
    session.setPlayerBotConfig(botId, newBotConfig);
  }

  io.to(roomCode).emit('room:bot_updated', { botId, difficulty });

  const [updatedSeats, spectators] = await Promise.all([
    getRoomSeats(redis, roomCode),
    getRoomSpectators(redis, roomCode),
  ]);
  io.to(roomCode).emit('seat:updated', { seats: updatedSeats, spectators });

  return { success: true };
}

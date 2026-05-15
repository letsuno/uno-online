import { randomUUID } from 'node:crypto';
import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../kv/types.js';
import type { BotDifficulty, BotPersonality } from '@uno-online/shared';
import { pickBotName, DIFFICULTY_PARAMS, MAX_PLAYERS, BOT_PERSONALITIES } from '@uno-online/shared';
import type { BotConfig } from '@uno-online/shared';
import { RoomManager } from '../plugins/core/room/manager.js';
import { getRoom, getRoomPlayers, setPlayerReady, addPlayerToRoom, setPlayerBotConfig } from '../plugins/core/room/store.js';
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
  roomManager: RoomManager,
  roomCode: string,
  requesterId: string,
  difficulty: BotDifficulty,
  session?: GameSession,
): Promise<{ success: true; botId: string } | { success: false; error: string }> {
  const room = await getRoom(redis, roomCode);
  if (!room) return { success: false, error: '房间不存在' };
  if (room.ownerId !== requesterId) return { success: false, error: '只有房主可以添加机器人' };

  const players = await getRoomPlayers(redis, roomCode);
  const activePlayers = players.filter((p) => !p.spectator);
  if (activePlayers.length >= MAX_PLAYERS) return { success: false, error: '房间已满' };

  const botId = `bot_${randomUUID()}`;
  const usedNames = new Set(players.map((p) => p.nickname));
  const name = pickBotName(usedNames);
  const personality: BotPersonality =
    BOT_PERSONALITIES[Math.floor(Math.random() * BOT_PERSONALITIES.length)]!;
  const botConfig: BotConfig = { difficulty, personality };

  if (room.status === 'waiting') {
    // Add directly via store so we can include botConfig, since
    // RoomManager.joinRoom does not accept botConfig.
    await addPlayerToRoom(redis, roomCode, {
      userId: botId,
      nickname: name,
      avatarUrl: null,
      role: 'normal',
      isBot: true,
      botConfig,
    });
    await setPlayerReady(redis, roomCode, botId, true);
  } else if (session) {
    // Game in progress: add to store and to the live session.
    await addPlayerToRoom(redis, roomCode, {
      userId: botId,
      nickname: name,
      avatarUrl: null,
      role: 'normal',
      isBot: true,
      botConfig,
    });
    session.addPlayer({ id: botId, name, avatarUrl: null, isBot: true, botConfig }, true);
  } else {
    return { success: false, error: '游戏进行中，无法添加机器人' };
  }

  const [updatedPlayers, updatedRoom] = await Promise.all([
    getRoomPlayers(redis, roomCode),
    getRoom(redis, roomCode),
  ]);

  io.to(roomCode).emit('room:bot_added', { botId, name, difficulty, personality });
  io.to(roomCode).emit('room:updated', { players: updatedPlayers, room: updatedRoom });

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
  roomManager: RoomManager,
  roomCode: string,
  requesterId: string,
  botId: string,
  session?: GameSession,
): Promise<{ success: true } | { success: false; error: string }> {
  const room = await getRoom(redis, roomCode);
  if (!room) return { success: false, error: '房间不存在' };
  if (room.ownerId !== requesterId) return { success: false, error: '只有房主可以移除机器人' };

  const players = await getRoomPlayers(redis, roomCode);
  const target = players.find((p) => p.userId === botId);
  if (!target) return { success: false, error: '机器人不在房间中' };
  if (!target.isBot) return { success: false, error: '目标玩家不是机器人' };

  if (session) {
    session.removePlayer(botId);
  }
  await roomManager.leaveRoom(roomCode, botId);

  const [updatedPlayers, updatedRoom] = await Promise.all([
    getRoomPlayers(redis, roomCode),
    getRoom(redis, roomCode),
  ]);

  io.to(roomCode).emit('room:bot_removed', { botId });
  io.to(roomCode).emit('room:updated', { players: updatedPlayers, room: updatedRoom });

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

  const players = await getRoomPlayers(redis, roomCode);
  const target = players.find(p => p.userId === botId);
  if (!target || !target.isBot) return { success: false, error: '目标不是人机' };

  // Persist to KV store
  const newBotConfig: BotConfig = {
    difficulty,
    personality: target.botConfig?.personality ?? 'balanced',
  };
  await setPlayerBotConfig(redis, roomCode, botId, newBotConfig);

  if (session) {
    session.setPlayerBotConfig(botId, newBotConfig);
  }

  io.to(roomCode).emit('room:bot_updated', { botId, difficulty });

  return { success: true };
}

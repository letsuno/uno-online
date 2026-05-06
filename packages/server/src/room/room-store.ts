import type Redis from 'ioredis';
import type { RoomSettings } from '@uno-online/shared';

export interface RoomData {
  ownerId: string;
  status: 'waiting' | 'playing' | 'finished';
  settings: RoomSettings;
  createdAt: string;
}

export interface RoomPlayer {
  userId: string;
  username: string;
  ready: boolean;
}

export async function createRoom(redis: Redis, roomCode: string, ownerId: string, settings: RoomSettings): Promise<void> {
  await redis.hset(`room:${roomCode}`, {
    ownerId,
    status: 'waiting',
    settings: JSON.stringify(settings),
    createdAt: new Date().toISOString(),
  });
}

export async function getRoom(redis: Redis, roomCode: string): Promise<RoomData | null> {
  const data = await redis.hgetall(`room:${roomCode}`);
  if (!data || !data['ownerId']) return null;
  return {
    ownerId: data['ownerId'],
    status: data['status'] as RoomData['status'],
    settings: JSON.parse(data['settings']!) as RoomSettings,
    createdAt: data['createdAt']!,
  };
}

export async function setRoomStatus(redis: Redis, roomCode: string, status: RoomData['status']): Promise<void> {
  await redis.hset(`room:${roomCode}`, 'status', status);
}

export async function setRoomSettings(redis: Redis, roomCode: string, settings: RoomSettings): Promise<void> {
  await redis.hset(`room:${roomCode}`, 'settings', JSON.stringify(settings));
}

export async function setRoomOwner(redis: Redis, roomCode: string, ownerId: string): Promise<void> {
  await redis.hset(`room:${roomCode}`, 'ownerId', ownerId);
}

export async function addPlayerToRoom(redis: Redis, roomCode: string, player: { userId: string; username: string }): Promise<void> {
  await redis.rpush(`room:${roomCode}:players`, JSON.stringify({ userId: player.userId, username: player.username, ready: false }));
}

export async function removePlayerFromRoom(redis: Redis, roomCode: string, userId: string): Promise<void> {
  const players = await getRoomPlayers(redis, roomCode);
  await redis.del(`room:${roomCode}:players`);
  const remaining = players.filter((p) => p.userId !== userId);
  if (remaining.length > 0) {
    await redis.rpush(`room:${roomCode}:players`, ...remaining.map((p) => JSON.stringify(p)));
  }
}

export async function getRoomPlayers(redis: Redis, roomCode: string): Promise<RoomPlayer[]> {
  const raw = await redis.lrange(`room:${roomCode}:players`, 0, -1);
  return raw.map((s) => JSON.parse(s) as RoomPlayer);
}

export async function setPlayerReady(redis: Redis, roomCode: string, userId: string, ready: boolean): Promise<void> {
  const players = await getRoomPlayers(redis, roomCode);
  const updated = players.map((p) => p.userId === userId ? { ...p, ready } : p);
  await redis.del(`room:${roomCode}:players`);
  if (updated.length > 0) {
    await redis.rpush(`room:${roomCode}:players`, ...updated.map((p) => JSON.stringify(p)));
  }
}

export async function deleteRoom(redis: Redis, roomCode: string): Promise<void> {
  const keys = await redis.keys(`room:${roomCode}*`);
  if (keys.length > 0) await redis.del(...keys);
  const gameKeys = await redis.keys(`game:${roomCode}*`);
  if (gameKeys.length > 0) await redis.del(...gameKeys);
}

import type { KvStore } from '../kv/types.js';
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

export async function createRoom(kv: KvStore, roomCode: string, ownerId: string, settings: RoomSettings): Promise<void> {
  await kv.hset(`room:${roomCode}`, {
    ownerId,
    status: 'waiting',
    settings: JSON.stringify(settings),
    createdAt: new Date().toISOString(),
  });
}

export async function getRoom(kv: KvStore, roomCode: string): Promise<RoomData | null> {
  const data = await kv.hgetall(`room:${roomCode}`);
  if (!data || !data['ownerId']) return null;
  return {
    ownerId: data['ownerId'],
    status: data['status'] as RoomData['status'],
    settings: JSON.parse(data['settings']!) as RoomSettings,
    createdAt: data['createdAt']!,
  };
}

export async function setRoomStatus(kv: KvStore, roomCode: string, status: RoomData['status']): Promise<void> {
  await kv.hset(`room:${roomCode}`, { status });
}

export async function setRoomSettings(kv: KvStore, roomCode: string, settings: RoomSettings): Promise<void> {
  await kv.hset(`room:${roomCode}`, { settings: JSON.stringify(settings) });
}

export async function setRoomOwner(kv: KvStore, roomCode: string, ownerId: string): Promise<void> {
  await kv.hset(`room:${roomCode}`, { ownerId });
}

export async function addPlayerToRoom(kv: KvStore, roomCode: string, player: { userId: string; username: string }): Promise<void> {
  await kv.rpush(`room:${roomCode}:players`, JSON.stringify({ userId: player.userId, username: player.username, ready: false }));
}

export async function removePlayerFromRoom(kv: KvStore, roomCode: string, userId: string): Promise<void> {
  const players = await getRoomPlayers(kv, roomCode);
  await kv.del(`room:${roomCode}:players`);
  const remaining = players.filter((p) => p.userId !== userId);
  if (remaining.length > 0) {
    await kv.rpush(`room:${roomCode}:players`, ...remaining.map((p) => JSON.stringify(p)));
  }
}

export async function getRoomPlayers(kv: KvStore, roomCode: string): Promise<RoomPlayer[]> {
  const raw = await kv.lrange(`room:${roomCode}:players`, 0, -1);
  return raw.map((s) => JSON.parse(s) as RoomPlayer);
}

export async function setPlayerReady(kv: KvStore, roomCode: string, userId: string, ready: boolean): Promise<void> {
  const players = await getRoomPlayers(kv, roomCode);
  const updated = players.map((p) => p.userId === userId ? { ...p, ready } : p);
  await kv.del(`room:${roomCode}:players`);
  if (updated.length > 0) {
    await kv.rpush(`room:${roomCode}:players`, ...updated.map((p) => JSON.stringify(p)));
  }
}

export async function deleteRoom(kv: KvStore, roomCode: string): Promise<void> {
  const keys = await kv.keys(`room:${roomCode}*`);
  if (keys.length > 0) await kv.del(...keys);
  const gameKeys = await kv.keys(`game:${roomCode}*`);
  if (gameKeys.length > 0) await kv.del(...gameKeys);
}

import type { KvStore } from '../../../kv/types.js';
import type { RoomSettings } from '@uno-online/shared';

export interface RoomData {
  ownerId: string;
  status: 'waiting' | 'playing' | 'finished';
  settings: RoomSettings;
  createdAt: string;
  lastActivityAt: string;
}

export interface RoomPlayer {
  userId: string;
  nickname: string;
  avatarUrl?: string | null;
  ready: boolean;
  spectator: boolean;
  role?: string;
  isBot: boolean;
}

const roomPlayerLocks = new Map<string, Promise<void>>();

async function withRoomPlayerLock<T>(roomCode: string, fn: () => Promise<T>): Promise<T> {
  const key = `room:${roomCode}:players`;
  while (roomPlayerLocks.has(key)) {
    await roomPlayerLocks.get(key);
  }
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  roomPlayerLocks.set(key, promise);
  try {
    return await fn();
  } finally {
    roomPlayerLocks.delete(key);
    resolve();
  }
}

export async function createRoom(kv: KvStore, roomCode: string, ownerId: string, settings: RoomSettings): Promise<void> {
  const now = new Date().toISOString();
  await kv.hset(`room:${roomCode}`, {
    ownerId,
    status: 'waiting',
    settings: JSON.stringify(settings),
    createdAt: now,
    lastActivityAt: now,
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
    lastActivityAt: data['lastActivityAt'] ?? data['createdAt']!,
  };
}

export async function setRoomStatus(kv: KvStore, roomCode: string, status: RoomData['status']): Promise<void> {
  await kv.hset(`room:${roomCode}`, { status });
}

export async function touchRoomActivity(kv: KvStore, roomCode: string): Promise<void> {
  await kv.hset(`room:${roomCode}`, { lastActivityAt: new Date().toISOString() });
}

export async function setRoomSettings(kv: KvStore, roomCode: string, settings: RoomSettings): Promise<void> {
  await kv.hset(`room:${roomCode}`, { settings: JSON.stringify(settings) });
}

export async function setRoomOwner(kv: KvStore, roomCode: string, ownerId: string): Promise<void> {
  await kv.hset(`room:${roomCode}`, { ownerId });
}

export async function getRoomPlayers(kv: KvStore, roomCode: string): Promise<RoomPlayer[]> {
  const raw = await kv.get(`room:${roomCode}:players`);
  if (!raw) return [];
  return JSON.parse(raw) as RoomPlayer[];
}

async function setRoomPlayers(kv: KvStore, roomCode: string, players: RoomPlayer[]): Promise<void> {
  if (players.length === 0) {
    await kv.del(`room:${roomCode}:players`);
  } else {
    await kv.set(`room:${roomCode}:players`, JSON.stringify(players));
  }
}

export async function addPlayerToRoom(kv: KvStore, roomCode: string, player: { userId: string; nickname: string; avatarUrl?: string | null; role?: string; isBot?: boolean }): Promise<void> {
  await withRoomPlayerLock(roomCode, async () => {
    const existing = await getRoomPlayers(kv, roomCode);
    if (existing.some(p => p.userId === player.userId)) return;
    existing.push({ userId: player.userId, nickname: player.nickname, avatarUrl: player.avatarUrl ?? null, ready: false, spectator: false, role: player.role ?? 'normal', isBot: player.isBot ?? false });
    await setRoomPlayers(kv, roomCode, existing);
  });
}

export async function removePlayerFromRoom(kv: KvStore, roomCode: string, userId: string): Promise<void> {
  await withRoomPlayerLock(roomCode, async () => {
    const players = await getRoomPlayers(kv, roomCode);
    const remaining = players.filter((p) => p.userId !== userId);
    await setRoomPlayers(kv, roomCode, remaining);
  });
}

export async function setPlayerReady(kv: KvStore, roomCode: string, userId: string, ready: boolean): Promise<void> {
  await withRoomPlayerLock(roomCode, async () => {
    const players = await getRoomPlayers(kv, roomCode);
    const updated = players.map((p) => p.userId === userId ? { ...p, ready } : p);
    await setRoomPlayers(kv, roomCode, updated);
  });
}

export async function setPlayerSpectator(kv: KvStore, roomCode: string, userId: string, spectator: boolean): Promise<void> {
  await withRoomPlayerLock(roomCode, async () => {
    const players = await getRoomPlayers(kv, roomCode);
    const updated = players.map((p) => p.userId === userId ? { ...p, spectator, ready: spectator ? false : p.ready } : p);
    await setRoomPlayers(kv, roomCode, updated);
  });
}

export async function resetAllPlayersReady(kv: KvStore, roomCode: string): Promise<void> {
  await withRoomPlayerLock(roomCode, async () => {
    const players = await getRoomPlayers(kv, roomCode);
    const updated = players.map((p) => ({ ...p, ready: false }));
    await setRoomPlayers(kv, roomCode, updated);
  });
}

export async function deleteRoom(kv: KvStore, roomCode: string): Promise<void> {
  await kv.del(
    `room:${roomCode}`,
    `room:${roomCode}:players`,
    `game:${roomCode}:state`,
  );
}

export async function setUserRoom(kv: KvStore, userId: string, roomCode: string): Promise<void> {
  await kv.set(`user:${userId}:room`, roomCode);
}

export async function clearUserRoom(kv: KvStore, userId: string): Promise<void> {
  await kv.del(`user:${userId}:room`);
}

export async function getUserRoom(kv: KvStore, userId: string): Promise<string | null> {
  return kv.get(`user:${userId}:room`);
}

export async function ensureNotInRoom(kv: KvStore, userId: string, targetRoomCode?: string): Promise<string | null> {
  const existingRoom = await getUserRoom(kv, userId);
  if (!existingRoom || existingRoom === targetRoomCode) return null;
  const room = await getRoom(kv, existingRoom);
  if (!room) {
    await clearUserRoom(kv, userId);
    return null;
  }
  return `你已在房间 ${existingRoom} 中，请先退出当前房间`;
}

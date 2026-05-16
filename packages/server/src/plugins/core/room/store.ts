import type { KvStore } from '../../../kv/types.js';
import type { RoomSettings, BotConfig } from '@uno-online/shared';
import { SEAT_COUNT } from '@uno-online/shared';
import type { RoomSeatPlayer, RoomSpectator, RoomSeats } from '@uno-online/shared';

export type { RoomSeatPlayer, RoomSpectator, RoomSeats };
export type RoomPlayer = RoomSeatPlayer;  // backward compat alias

export interface RoomData {
  ownerId: string;
  status: 'waiting' | 'playing' | 'finished';
  settings: RoomSettings;
  createdAt: string;
  lastActivityAt: string;
}

// ─── Lock ──────────────────────────────────────────────────────────────────

const roomSeatLocks = new Map<string, Promise<void>>();

async function withRoomSeatLock<T>(roomCode: string, fn: () => Promise<T>): Promise<T> {
  const key = `room:${roomCode}:seats`;
  while (roomSeatLocks.has(key)) {
    await roomSeatLocks.get(key);
  }
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  roomSeatLocks.set(key, promise);
  try {
    return await fn();
  } finally {
    roomSeatLocks.delete(key);
    resolve();
  }
}

// ─── Room CRUD (unchanged) ─────────────────────────────────────────────────

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

export async function deleteRoom(kv: KvStore, roomCode: string): Promise<void> {
  await kv.del(
    `room:${roomCode}`,
    `room:${roomCode}:seats`,
    `room:${roomCode}:spectators`,
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

// ─── Seat helpers ──────────────────────────────────────────────────────────

function emptySeats(): RoomSeats {
  return Array.from({ length: SEAT_COUNT }, () => null);
}

export async function getRoomSeats(kv: KvStore, roomCode: string): Promise<RoomSeats> {
  const raw = await kv.get(`room:${roomCode}:seats`);
  if (!raw) return emptySeats();
  const parsed = JSON.parse(raw) as RoomSeats;
  // Pad to SEAT_COUNT if stored array is shorter
  while (parsed.length < SEAT_COUNT) {
    parsed.push(null);
  }
  return parsed;
}

export async function setRoomSeats(kv: KvStore, roomCode: string, seats: RoomSeats): Promise<void> {
  await kv.set(`room:${roomCode}:seats`, JSON.stringify(seats));
}

export async function takeSeat(
  kv: KvStore,
  roomCode: string,
  seatIndex: number,
  player: RoomSeatPlayer,
): Promise<void> {
  await withRoomSeatLock(roomCode, async () => {
    if (seatIndex < 0 || seatIndex >= SEAT_COUNT) {
      throw new Error(`无效座位编号: ${seatIndex}`);
    }
    const seats = await getRoomSeats(kv, roomCode);
    if (seats[seatIndex] !== null) {
      throw new Error(`座位 ${seatIndex} 已被占用`);
    }
    // Clear player from any existing seat first
    for (let i = 0; i < seats.length; i++) {
      if (seats[i]?.userId === player.userId) {
        seats[i] = null;
        break;
      }
    }
    seats[seatIndex] = player;
    await setRoomSeats(kv, roomCode, seats);
  });
}

export async function leaveSeat(kv: KvStore, roomCode: string, userId: string): Promise<number> {
  return withRoomSeatLock(roomCode, async () => {
    const seats = await getRoomSeats(kv, roomCode);
    const index = seats.findIndex(s => s?.userId === userId);
    if (index !== -1) {
      seats[index] = null;
      await setRoomSeats(kv, roomCode, seats);
    }
    return index;
  });
}

export async function swapSeats(
  kv: KvStore,
  roomCode: string,
  userId1: string,
  userId2: string,
): Promise<{ seat1: number; seat2: number }> {
  return withRoomSeatLock(roomCode, async () => {
    const seats = await getRoomSeats(kv, roomCode);
    const seat1 = seats.findIndex(s => s?.userId === userId1);
    const seat2 = seats.findIndex(s => s?.userId === userId2);
    if (seat1 === -1) throw new Error(`用户 ${userId1} 未就座`);
    if (seat2 === -1) throw new Error(`用户 ${userId2} 未就座`);
    [seats[seat1], seats[seat2]] = [seats[seat2]!, seats[seat1]!];
    await setRoomSeats(kv, roomCode, seats);
    return { seat1, seat2 };
  });
}

export async function setSeatPlayerReady(
  kv: KvStore,
  roomCode: string,
  userId: string,
  ready: boolean,
): Promise<void> {
  await withRoomSeatLock(roomCode, async () => {
    const seats = await getRoomSeats(kv, roomCode);
    const index = seats.findIndex(s => s?.userId === userId);
    if (index !== -1) {
      seats[index] = { ...seats[index]!, ready };
      await setRoomSeats(kv, roomCode, seats);
    }
  });
}

export async function setSeatPlayerConnected(
  kv: KvStore,
  roomCode: string,
  userId: string,
  connected: boolean,
): Promise<void> {
  await withRoomSeatLock(roomCode, async () => {
    const seats = await getRoomSeats(kv, roomCode);
    const index = seats.findIndex(s => s?.userId === userId);
    if (index !== -1) {
      seats[index] = {
        ...seats[index]!,
        connected,
        // When disconnecting, also mark as not ready
        ready: connected ? seats[index]!.ready : false,
      };
      await setRoomSeats(kv, roomCode, seats);
    }
  });
}

export async function setSeatPlayerBotConfig(
  kv: KvStore,
  roomCode: string,
  userId: string,
  botConfig: BotConfig,
): Promise<void> {
  await withRoomSeatLock(roomCode, async () => {
    const seats = await getRoomSeats(kv, roomCode);
    const index = seats.findIndex(s => s?.userId === userId);
    if (index !== -1) {
      seats[index] = { ...seats[index]!, botConfig };
      await setRoomSeats(kv, roomCode, seats);
    }
  });
}

export async function clearSeatByUserId(kv: KvStore, roomCode: string, userId: string): Promise<number> {
  return withRoomSeatLock(roomCode, async () => {
    const seats = await getRoomSeats(kv, roomCode);
    const index = seats.findIndex(s => s?.userId === userId);
    if (index !== -1) {
      seats[index] = null;
      await setRoomSeats(kv, roomCode, seats);
    }
    return index;
  });
}

export async function resetAllSeatsReady(kv: KvStore, roomCode: string): Promise<void> {
  await withRoomSeatLock(roomCode, async () => {
    const seats = await getRoomSeats(kv, roomCode);
    const updated = seats.map(s => s !== null ? { ...s, ready: false } : null);
    await setRoomSeats(kv, roomCode, updated);
  });
}

export function getFirstEmptySeatIndex(seats: RoomSeats): number {
  return seats.findIndex(s => s === null);
}

export function getSeatedPlayers(seats: RoomSeats): RoomSeatPlayer[] {
  return seats.filter((s): s is RoomSeatPlayer => s !== null);
}

// ─── Spectator CRUD ────────────────────────────────────────────────────────

export async function getRoomSpectators(kv: KvStore, roomCode: string): Promise<RoomSpectator[]> {
  const raw = await kv.get(`room:${roomCode}:spectators`);
  if (!raw) return [];
  return JSON.parse(raw) as RoomSpectator[];
}

async function setRoomSpectators(kv: KvStore, roomCode: string, spectators: RoomSpectator[]): Promise<void> {
  if (spectators.length === 0) {
    await kv.del(`room:${roomCode}:spectators`);
  } else {
    await kv.set(`room:${roomCode}:spectators`, JSON.stringify(spectators));
  }
}

export async function addSpectatorToRoom(kv: KvStore, roomCode: string, spectator: RoomSpectator): Promise<void> {
  await withRoomSeatLock(roomCode, async () => {
    const spectators = await getRoomSpectators(kv, roomCode);
    if (spectators.some(s => s.userId === spectator.userId)) return;
    spectators.push(spectator);
    await setRoomSpectators(kv, roomCode, spectators);
  });
}

export async function removeSpectatorFromRoom(kv: KvStore, roomCode: string, userId: string): Promise<void> {
  await withRoomSeatLock(roomCode, async () => {
    const spectators = await getRoomSpectators(kv, roomCode);
    const remaining = spectators.filter(s => s.userId !== userId);
    await setRoomSpectators(kv, roomCode, remaining);
  });
}

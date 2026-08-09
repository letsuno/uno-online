import type { KvStore } from '../../../kv/types.js';
import type { RoomData, RoomSettings, BotConfig } from '@uno-online/shared';
import { isBotConfig, isCurrentRoomSettings, isUserRole, SEAT_COUNT } from '@uno-online/shared';
import type { RoomSeatPlayer, RoomSpectator, RoomSeats } from '@uno-online/shared';
import { departureKey, getDepartedMemberIds } from './departure-store.js';

export type { RoomSeatPlayer, RoomSpectator, RoomSeats };

export type { RoomData } from '@uno-online/shared';

export class RoomStateCorruptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomStateCorruptionError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isRoomStatus(value: string): value is RoomData['status'] {
  return value === 'waiting' || value === 'playing' || value === 'finished';
}

function requireStoredString(data: Record<string, string>, fieldName: string, roomCode: string): string {
  const value = data[fieldName];
  if (typeof value !== 'string' || value.length === 0) {
    throw new RoomStateCorruptionError(`Room ${roomCode} has invalid ${fieldName}`);
  }
  return value;
}

function requireRoomSettings(value: unknown, roomCode: string): RoomSettings {
  if (!isCurrentRoomSettings(value)) {
    throw new RoomStateCorruptionError(`Room ${roomCode} has invalid settings`);
  }
  return value;
}

function parseStoredJson(raw: string, description: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new RoomStateCorruptionError(`${description} is not valid JSON`);
  }
}

function hasNullableString(value: Record<string, unknown>, fieldName: string): boolean {
  const field = value[fieldName];
  return field === null || typeof field === 'string';
}

function requireRoomSeats(value: unknown, roomCode: string): RoomSeats {
  if (!Array.isArray(value) || value.length !== SEAT_COUNT) {
    throw new RoomStateCorruptionError(`Room ${roomCode} seats must contain exactly ${SEAT_COUNT} entries`);
  }

  const userIds = new Set<string>();
  for (const seat of value) {
    if (seat === null) continue;
    if (
      !isRecord(seat) ||
      typeof seat['userId'] !== 'string' ||
      seat['userId'].length === 0 ||
      typeof seat['nickname'] !== 'string' ||
      seat['nickname'].length === 0 ||
      typeof seat['ready'] !== 'boolean' ||
      typeof seat['connected'] !== 'boolean' ||
      typeof seat['isBot'] !== 'boolean' ||
      !hasNullableString(seat, 'avatarUrl') ||
      !isUserRole(seat['role']) ||
      (seat['isBot'] ? !isBotConfig(seat['botConfig']) : seat['botConfig'] !== undefined) ||
      userIds.has(seat['userId'])
    ) {
      throw new RoomStateCorruptionError(`Room ${roomCode} contains an invalid seat`);
    }
    userIds.add(seat['userId']);
  }
  return value as RoomSeats;
}

function requireRoomSpectators(value: unknown, roomCode: string): RoomSpectator[] {
  if (!Array.isArray(value)) {
    throw new RoomStateCorruptionError(`Room ${roomCode} spectators must be an array`);
  }

  const userIds = new Set<string>();
  for (const spectator of value) {
    if (
      !isRecord(spectator) ||
      typeof spectator['userId'] !== 'string' ||
      spectator['userId'].length === 0 ||
      typeof spectator['nickname'] !== 'string' ||
      spectator['nickname'].length === 0 ||
      typeof spectator['connected'] !== 'boolean' ||
      !hasNullableString(spectator, 'avatarUrl') ||
      !isUserRole(spectator['role']) ||
      userIds.has(spectator['userId'])
    ) {
      throw new RoomStateCorruptionError(`Room ${roomCode} contains an invalid spectator`);
    }
    userIds.add(spectator['userId']);
  }
  return value as RoomSpectator[];
}

// ─── Lock ──────────────────────────────────────────────────────────────────

const roomSeatLocks = new Map<string, Promise<void>>();
const roomOwnerLocks = new Map<string, Promise<void>>();

async function withRoomSeatLock<T>(roomCode: string, fn: () => Promise<T>): Promise<T> {
  const key = `room:${roomCode}:seats`;
  while (roomSeatLocks.has(key)) {
    await roomSeatLocks.get(key);
  }
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  roomSeatLocks.set(key, promise);
  try {
    return await fn();
  } finally {
    roomSeatLocks.delete(key);
    resolve();
  }
}

// ─── Room CRUD (unchanged) ─────────────────────────────────────────────────

export async function createRoom(
  kv: KvStore,
  roomCode: string,
  ownerId: string,
  settings: RoomSettings,
): Promise<void> {
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
  if (!data || Object.keys(data).length === 0) return null;

  const ownerId = requireStoredString(data, 'ownerId', roomCode);
  const status = requireStoredString(data, 'status', roomCode);
  const settingsRaw = requireStoredString(data, 'settings', roomCode);
  const createdAt = requireStoredString(data, 'createdAt', roomCode);
  const lastActivityAt = requireStoredString(data, 'lastActivityAt', roomCode);
  if (!isRoomStatus(status)) {
    throw new RoomStateCorruptionError(`Room ${roomCode} has invalid status`);
  }
  if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(lastActivityAt))) {
    throw new RoomStateCorruptionError(`Room ${roomCode} has invalid timestamps`);
  }

  const settings = requireRoomSettings(parseStoredJson(settingsRaw, `Room ${roomCode} settings`), roomCode);
  return {
    ownerId,
    status,
    settings,
    createdAt,
    lastActivityAt,
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
  await withRoomOwnerLock(roomCode, () => kv.hset(`room:${roomCode}`, { ownerId }));
}

/** Change the owner only while it still matches the caller's snapshot. */
export async function setRoomOwnerIfMatches(
  kv: KvStore,
  roomCode: string,
  expectedOwnerId: string,
  nextOwnerId: string,
): Promise<boolean> {
  return withRoomOwnerLock(roomCode, async () => {
    const room = await getRoom(kv, roomCode);
    if (!room || room.ownerId !== expectedOwnerId) return false;
    try {
      await kv.hset(`room:${roomCode}`, { ownerId: nextOwnerId });
    } catch (writeError) {
      // Redis may commit HSET and lose only its response. Treat the durable
      // owner as the commit boundary so manual/automatic transfer does not
      // report failure and leave every client on a permanently stale owner.
      const committedRoom = await getRoom(kv, roomCode).catch(() => null);
      if (committedRoom?.ownerId !== nextOwnerId) throw writeError;
    }
    return true;
  });
}

export function getRoomStorageKeys(roomCode: string): string[] {
  return [
    `room:${roomCode}`,
    `room:${roomCode}:seats`,
    `room:${roomCode}:spectators`,
    `room:${roomCode}:departed`,
    `game:${roomCode}:state`,
  ];
}

export async function deleteRoom(kv: KvStore, roomCode: string): Promise<void> {
  await kv.del(...getRoomStorageKeys(roomCode));
}

export async function setUserRoom(kv: KvStore, userId: string, roomCode: string): Promise<void> {
  await kv.set(`user:${userId}:room`, roomCode);
}

export async function setUserRoomIfAbsent(kv: KvStore, userId: string, roomCode: string): Promise<boolean> {
  return kv.setIfAbsent(`user:${userId}:room`, roomCode);
}

async function withRoomOwnerLock<T>(roomCode: string, fn: () => Promise<T>): Promise<T> {
  const previous = roomOwnerLocks.get(roomCode) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  roomOwnerLocks.set(roomCode, tail);

  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (roomOwnerLocks.get(roomCode) === tail) roomOwnerLocks.delete(roomCode);
  }
}

/**
 * Clear a reverse membership mapping only when it still points at the room
 * being cleaned up. Delayed disconnect/spectator sweeps must never erase a
 * newer room membership created after the old socket went stale.
 */
export async function clearUserRoomIfMatches(kv: KvStore, userId: string, roomCode: string): Promise<boolean> {
  const key = `user:${userId}:room`;
  return kv.compareAndDelete(key, roomCode);
}

export async function getUserRoom(kv: KvStore, userId: string): Promise<string | null> {
  return kv.get(`user:${userId}:room`);
}

export async function ensureNotInRoom(kv: KvStore, userId: string, targetRoomCode?: string): Promise<string | null> {
  const existingRoom = await getUserRoom(kv, userId);
  if (!existingRoom || existingRoom === targetRoomCode) return null;
  const room = await getRoom(kv, existingRoom);
  if (!room) {
    await clearUserRoomIfMatches(kv, userId, existingRoom);
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
  if (raw === null) return emptySeats();
  return requireRoomSeats(parseStoredJson(raw, `Room ${roomCode} seats`), roomCode);
}

export async function setRoomSeats(kv: KvStore, roomCode: string, seats: RoomSeats): Promise<void> {
  const key = `room:${roomCode}:seats`;
  const serialized = JSON.stringify(seats);
  try {
    await kv.set(key, serialized);
  } catch (error) {
    // A backend may durably apply a write and lose only the response. Do not
    // make callers compensate or retry an already-committed seat mutation.
    try {
      if ((await kv.get(key)) === serialized) return;
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
}

export async function takeSeat(
  kv: KvStore,
  roomCode: string,
  seatIndex: number,
  player: RoomSeatPlayer,
): Promise<void> {
  await withRoomSeatLock(roomCode, async () => {
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= SEAT_COUNT) {
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

export async function setSeatPlayerReady(kv: KvStore, roomCode: string, userId: string, ready: boolean): Promise<void> {
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

export function getFirstEmptySeatIndex(seats: RoomSeats): number {
  return seats.findIndex(s => s === null);
}

export function getSeatedPlayers(seats: RoomSeats): RoomSeatPlayer[] {
  return seats.filter((s): s is RoomSeatPlayer => s !== null);
}

// ─── Spectator CRUD (KV-persisted, mirrors seat lifecycle) ────────────────

export async function getRoomSpectators(kv: KvStore, roomCode: string): Promise<RoomSpectator[]> {
  const raw = await kv.get(`room:${roomCode}:spectators`);
  if (raw === null) return [];
  return requireRoomSpectators(parseStoredJson(raw, `Room ${roomCode} spectators`), roomCode);
}

async function setRoomSpectators(kv: KvStore, roomCode: string, spectators: RoomSpectator[]): Promise<void> {
  const key = `room:${roomCode}:spectators`;
  const expected = spectators.length === 0 ? null : JSON.stringify(spectators);
  try {
    if (expected === null) {
      await kv.del(key);
    } else {
      await kv.set(key, expected);
    }
  } catch (error) {
    try {
      if ((await kv.get(key)) === expected) return;
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
}

export async function addSpectatorToRoom(kv: KvStore, roomCode: string, spectator: RoomSpectator): Promise<void> {
  await withRoomSeatLock(roomCode, async () => {
    const spectators = await getRoomSpectators(kv, roomCode);
    const idx = spectators.findIndex(s => s.userId === spectator.userId);
    if (idx !== -1) {
      spectators[idx] = spectator;
    } else {
      spectators.push(spectator);
    }
    await setRoomSpectators(kv, roomCode, spectators);
  });
}

/** Atomically publish both halves of a room roster. */
export async function setRoomRoster(
  kv: KvStore,
  roomCode: string,
  seats: RoomSeats,
  spectators: RoomSpectator[],
): Promise<void> {
  const expectedSeats = JSON.stringify(seats);
  const expectedSpectators = spectators.length === 0 ? null : JSON.stringify(spectators);
  try {
    await kv.batchStrings(roomRosterBatchOperations(roomCode, seats, spectators));
  } catch (error) {
    // Redis MULTI/EXEC can commit both roster keys and then lose its reply.
    // Verify the exact transaction result before reporting an ambiguous
    // failure that would desynchronise socket flags from the durable roster.
    try {
      const [writtenSeats, writtenSpectators] = await Promise.all([
        kv.get(`room:${roomCode}:seats`),
        kv.get(`room:${roomCode}:spectators`),
      ]);
      if (writtenSeats === expectedSeats && writtenSpectators === expectedSpectators) return;
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  }
}

function roomRosterBatchOperations(roomCode: string, seats: RoomSeats, spectators: RoomSpectator[]) {
  const spectatorKey = `room:${roomCode}:spectators`;
  return [
    { type: 'set' as const, key: `room:${roomCode}:seats`, value: JSON.stringify(seats) },
    spectators.length === 0
      ? { type: 'del' as const, key: spectatorKey }
      : { type: 'set' as const, key: spectatorKey, value: JSON.stringify(spectators) },
  ];
}

/**
 * Add/update a spectator and publish their reverse room mapping in the same
 * durable string transaction. A socket adapter join is only a live
 * projection of this membership and may be compensated independently.
 */
export async function addSpectatorWithMembership(
  kv: KvStore,
  roomCode: string,
  spectator: RoomSpectator,
): Promise<{ seats: RoomSeats; spectators: RoomSpectator[] }> {
  return withRoomSeatLock(roomCode, async () => {
    const [seats, spectators] = await Promise.all([getRoomSeats(kv, roomCode), getRoomSpectators(kv, roomCode)]);
    const spectatorIndex = spectators.findIndex(item => item.userId === spectator.userId);
    if (spectatorIndex === -1) spectators.push(spectator);
    else spectators[spectatorIndex] = spectator;

    const operations = [
      ...roomRosterBatchOperations(roomCode, seats, spectators),
      { type: 'set' as const, key: `user:${spectator.userId}:room`, value: roomCode },
    ];
    try {
      await kv.batchStrings(operations);
    } catch (error) {
      // MULTI/EXEC can commit and lose only its response. Verify the exact
      // three-key result before compensating a membership that already won.
      try {
        const [writtenSeats, writtenSpectators, writtenMapping] = await Promise.all([
          kv.get(`room:${roomCode}:seats`),
          kv.get(`room:${roomCode}:spectators`),
          getUserRoom(kv, spectator.userId),
        ]);
        const expectedSpectators = spectators.length === 0 ? null : JSON.stringify(spectators);
        if (
          writtenSeats === JSON.stringify(seats) &&
          writtenSpectators === expectedSpectators &&
          writtenMapping === roomCode
        )
          return { seats, spectators };
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    }
    return { seats, spectators };
  });
}

/**
 * Remove every roster occurrence of a member and, if it still points at this
 * room, their reverse mapping in one durable transaction. Reading the
 * mapping inside the roster lock avoids deleting a known newer membership;
 * callers also hold the per-user membership lock around this operation.
 */
export async function removeMemberWithMembership(
  kv: KvStore,
  roomCode: string,
  userId: string,
): Promise<{
  seatIndex: number;
  spectatorNickname: string | null;
  mappingCleared: boolean;
  seats: RoomSeats;
  spectators: RoomSpectator[];
}> {
  return withRoomSeatLock(roomCode, async () => {
    const [seats, spectators, mappedRoom] = await Promise.all([
      getRoomSeats(kv, roomCode),
      getRoomSpectators(kv, roomCode),
      getUserRoom(kv, userId),
    ]);
    let seatIndex = -1;
    for (let index = 0; index < seats.length; index++) {
      if (seats[index]?.userId !== userId) continue;
      if (seatIndex === -1) seatIndex = index;
      seats[index] = null;
    }
    const spectator = spectators.find(item => item.userId === userId);
    const remainingSpectators = spectators.filter(item => item.userId !== userId);
    const mappingCleared = mappedRoom === roomCode;

    const operations = [
      ...roomRosterBatchOperations(roomCode, seats, remainingSpectators),
      ...(mappingCleared ? [{ type: 'del' as const, key: `user:${userId}:room` }] : []),
    ];
    try {
      await kv.batchStrings(operations);
    } catch (error) {
      try {
        const [writtenSeats, writtenSpectators, writtenMapping] = await Promise.all([
          kv.get(`room:${roomCode}:seats`),
          kv.get(`room:${roomCode}:spectators`),
          getUserRoom(kv, userId),
        ]);
        const expectedSpectators = remainingSpectators.length === 0 ? null : JSON.stringify(remainingSpectators);
        const expectedMapping = mappingCleared ? null : mappedRoom;
        if (
          writtenSeats === JSON.stringify(seats) &&
          writtenSpectators === expectedSpectators &&
          writtenMapping === expectedMapping
        ) {
          return {
            seatIndex,
            spectatorNickname: spectator?.nickname ?? null,
            mappingCleared,
            seats,
            spectators: remainingSpectators,
          };
        }
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    }
    return {
      seatIndex,
      spectatorNickname: spectator?.nickname ?? null,
      mappingCleared,
      seats,
      spectators: remainingSpectators,
    };
  });
}

/**
 * Publish a seated human's connectivity and explicit-departure intent as one
 * durable mutation. This prevents a failed active leave from recording only
 * the departure marker (which could make another player's leave dissolve a
 * room whose first player never received a successful acknowledgement).
 */
export async function setSeatConnectionAndDeparture(
  kv: KvStore,
  roomCode: string,
  userId: string,
  connected: boolean,
  departed: boolean,
): Promise<{ seats: RoomSeats; spectators: RoomSpectator[] }> {
  return withRoomSeatLock(roomCode, async () => {
    const departedStateKey = departureKey(roomCode);
    const [seats, spectators, departedIds] = await Promise.all([
      getRoomSeats(kv, roomCode),
      getRoomSpectators(kv, roomCode),
      getDepartedMemberIds(kv, roomCode),
    ]);
    const seatIndex = seats.findIndex(seat => seat?.userId === userId);
    if (seatIndex === -1) throw new Error('玩家不在座位中');
    seats[seatIndex] = {
      ...seats[seatIndex]!,
      connected,
      ready: connected ? seats[seatIndex]!.ready : false,
    };

    if (departed) departedIds.add(userId);
    else departedIds.delete(userId);
    const serializedDeparted = JSON.stringify([...departedIds]);
    const operations = [
      ...roomRosterBatchOperations(roomCode, seats, spectators),
      departedIds.size === 0
        ? { type: 'del' as const, key: departedStateKey }
        : { type: 'set' as const, key: departedStateKey, value: serializedDeparted },
    ];

    try {
      await kv.batchStrings(operations);
    } catch (error) {
      // Redis may commit EXEC and then lose the response. Treat an exact
      // durable match as success; otherwise propagate so the caller restores
      // its in-memory GameSession in place.
      try {
        const [writtenSeats, writtenSpectators, writtenDeparted] = await Promise.all([
          kv.get(`room:${roomCode}:seats`),
          kv.get(`room:${roomCode}:spectators`),
          kv.get(departedStateKey),
        ]);
        const expectedSpectators = spectators.length === 0 ? null : JSON.stringify(spectators);
        const expectedDeparted = departedIds.size === 0 ? null : serializedDeparted;
        if (
          writtenSeats === JSON.stringify(seats) &&
          writtenSpectators === expectedSpectators &&
          writtenDeparted === expectedDeparted
        )
          return { seats, spectators };
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    }
    return { seats, spectators };
  });
}

/** Move a seated human to the spectator roster without exposing a split state. */
export async function moveSeatToSpectator(
  kv: KvStore,
  roomCode: string,
  userId: string,
  spectator: RoomSpectator,
): Promise<number> {
  return withRoomSeatLock(roomCode, async () => {
    const [seats, spectators] = await Promise.all([getRoomSeats(kv, roomCode), getRoomSpectators(kv, roomCode)]);
    let seatIndex = -1;
    for (let index = 0; index < seats.length; index++) {
      if (seats[index]?.userId !== userId) continue;
      if (seatIndex === -1) seatIndex = index;
      seats[index] = null;
    }

    const spectatorIndex = spectators.findIndex(item => item.userId === userId);
    if (spectatorIndex === -1) spectators.push(spectator);
    else spectators[spectatorIndex] = spectator;

    await setRoomRoster(kv, roomCode, seats, spectators);
    return seatIndex;
  });
}

/** Move a spectator into a seat as one roster mutation. */
export async function moveSpectatorToSeat(
  kv: KvStore,
  roomCode: string,
  seatIndex: number,
  player: RoomSeatPlayer,
): Promise<void> {
  await withRoomSeatLock(roomCode, async () => {
    if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= SEAT_COUNT) {
      throw new Error(`无效座位编号: ${seatIndex}`);
    }
    const [seats, spectators] = await Promise.all([getRoomSeats(kv, roomCode), getRoomSpectators(kv, roomCode)]);
    if (seats[seatIndex] !== null) throw new Error(`座位 ${seatIndex} 已被占用`);
    const spectatorIndex = spectators.findIndex(item => item.userId === player.userId);
    if (spectatorIndex === -1) throw new Error('玩家不在观战席');

    for (let i = 0; i < seats.length; i++) {
      if (seats[i]?.userId === player.userId) seats[i] = null;
    }
    seats[seatIndex] = player;
    spectators.splice(spectatorIndex, 1);
    await setRoomRoster(kv, roomCode, seats, spectators);
  });
}

/**
 * Replace the waiting-room roster with spectators in one critical section.
 * Used after game_over so offline humans remain room members and can rejoin.
 */
export async function replaceRosterWithSpectators(
  kv: KvStore,
  roomCode: string,
  spectators: RoomSpectator[],
): Promise<void> {
  await withRoomSeatLock(roomCode, async () => {
    const unique = new Map<string, RoomSpectator>();
    for (const spectator of spectators) unique.set(spectator.userId, spectator);
    await setRoomRoster(kv, roomCode, emptySeats(), [...unique.values()]);
  });
}

/** Remove every seat/spectator occurrence of a member as one roster mutation. */
export async function removeMemberFromRoomRoster(
  kv: KvStore,
  roomCode: string,
  userId: string,
): Promise<{ seatIndex: number; spectatorNickname: string | null }> {
  return withRoomSeatLock(roomCode, async () => {
    const [seats, spectators] = await Promise.all([getRoomSeats(kv, roomCode), getRoomSpectators(kv, roomCode)]);
    let seatIndex = -1;
    for (let index = 0; index < seats.length; index++) {
      if (seats[index]?.userId !== userId) continue;
      if (seatIndex === -1) seatIndex = index;
      seats[index] = null;
    }

    const spectator = spectators.find(item => item.userId === userId);
    const remainingSpectators = spectators.filter(item => item.userId !== userId);
    if (seatIndex !== -1 || remainingSpectators.length !== spectators.length) {
      await setRoomRoster(kv, roomCode, seats, remainingSpectators);
    }
    return {
      seatIndex,
      spectatorNickname: spectator?.nickname ?? null,
    };
  });
}

export async function setSpectatorConnected(
  kv: KvStore,
  roomCode: string,
  userId: string,
  connected: boolean,
): Promise<void> {
  await withRoomSeatLock(roomCode, async () => {
    const spectators = await getRoomSpectators(kv, roomCode);
    const idx = spectators.findIndex(s => s.userId === userId);
    if (idx !== -1) {
      spectators[idx] = {
        ...spectators[idx]!,
        connected,
      };
      await setRoomSpectators(kv, roomCode, spectators);
    }
  });
}

export async function clearRoomSpectators(kv: KvStore, roomCode: string): Promise<void> {
  await kv.del(`room:${roomCode}:spectators`);
}

/**
 * Startup reconciliation: a restarted process has no sockets, so every
 * connected:true persisted by the previous process is a ghost and can win
 * owner transfers while its user is gone. Mark all
 * human members disconnected (bots have no sockets to lose); rejoins flip
 * them back. `isLive` is evaluated INSIDE the seat lock at write time — a
 * pre-sampled set would race the restart reconnection storm and flip
 * freshly-rejoined users back to disconnected.
 */
export async function markAllMembersDisconnected(
  kv: KvStore,
  roomCode: string,
  isLive?: (userId: string) => boolean,
): Promise<void> {
  await withRoomSeatLock(roomCode, async () => {
    const seats = await getRoomSeats(kv, roomCode);
    let seatsChanged = false;
    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i];
      if (seat && !seat.isBot && seat.connected && !isLive?.(seat.userId)) {
        seats[i] = { ...seat, connected: false, ready: false };
        seatsChanged = true;
      }
    }
    if (seatsChanged) await setRoomSeats(kv, roomCode, seats);

    const spectators = await getRoomSpectators(kv, roomCode);
    let specChanged = false;
    const updated = spectators.map(s => {
      if (!s.connected || isLive?.(s.userId)) return s;
      specChanged = true;
      return { ...s, connected: false };
    });
    if (specChanged) await setRoomSpectators(kv, roomCode, updated);
  });
}

export function pickNextOwner(seats: RoomSeats, spectators: RoomSpectator[], excludeUserId?: string): string | null {
  const seated = getSeatedPlayers(seats);
  const next =
    seated.find(p => !p.isBot && p.connected && p.userId !== excludeUserId) ??
    spectators.find(s => s.connected && s.userId !== excludeUserId);
  return next?.userId ?? null;
}

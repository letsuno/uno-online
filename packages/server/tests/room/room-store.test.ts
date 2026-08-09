import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import { MemoryKvStore } from '../../src/kv/memory';
import {
  createRoom,
  getRoom,
  deleteRoom,
  getRoomSeats,
  takeSeat,
  setSeatPlayerReady,
  getSeatedPlayers,
  getRoomSpectators,
  moveSeatToSpectator,
  moveSpectatorToSeat,
  replaceRosterWithSpectators,
  removeMemberFromRoomRoster,
  addSpectatorWithMembership,
  removeMemberWithMembership,
  setSeatConnectionAndDeparture,
  addSpectatorToRoom,
  setUserRoom,
  getUserRoom,
  clearUserRoomIfMatches,
  RoomStateCorruptionError,
  setRoomOwnerIfMatches,
} from '../../src/plugins/core/room/store';
import type { RoomSeatPlayer } from '../../src/plugins/core/room/store';
import { RoomDepartureCorruptionError } from '../../src/plugins/core/room/departure-store';

const kv = new MemoryKvStore();
const TEST_CODE = 'TEST01';
const TEST_SETTINGS = {
  turnTimeLimit: 30 as const,
  targetScore: 500 as const,
  houseRules: DEFAULT_HOUSE_RULES,
  allowSpectators: true,
  spectatorMode: 'hidden' as const,
};

function makePlayer(userId: string, username: string): RoomSeatPlayer {
  return { userId, nickname: username, avatarUrl: null, ready: false, connected: true, role: 'normal', isBot: false };
}

function makeSpectator(userId: string, nickname: string, connected: boolean) {
  return { userId, nickname, avatarUrl: null, role: 'normal' as const, connected };
}

beforeEach(async () => {
  const keys = await kv.keys(`room:${TEST_CODE}*`);
  if (keys.length > 0) await kv.del(...keys);
});

afterAll(async () => {
  await kv.disconnect();
});

describe('room-store', () => {
  it('creates and retrieves a room', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', TEST_SETTINGS);
    const room = await getRoom(kv, TEST_CODE);
    expect(room).not.toBeNull();
    expect(room!.ownerId).toBe('owner-1');
    expect(room!.status).toBe('waiting');
  });

  it('rejects a partial room hash instead of treating it as missing', async () => {
    await kv.hset(`room:${TEST_CODE}`, { ownerId: 'owner-1' });

    await expect(getRoom(kv, TEST_CODE)).rejects.toBeInstanceOf(RoomStateCorruptionError);
  });

  it('rejects room data without the current activity timestamp', async () => {
    const createdAt = new Date().toISOString();
    await kv.hset(`room:${TEST_CODE}`, {
      ownerId: 'owner-1',
      status: 'waiting',
      settings: JSON.stringify(TEST_SETTINGS),
      createdAt,
    });

    await expect(getRoom(kv, TEST_CODE)).rejects.toBeInstanceOf(RoomStateCorruptionError);
  });

  it('rejects a room with malformed current settings', async () => {
    const now = new Date().toISOString();
    await kv.hset(`room:${TEST_CODE}`, {
      ownerId: 'owner-1',
      status: 'waiting',
      settings: JSON.stringify({ turnTimeLimit: 30, targetScore: 500 }),
      createdAt: now,
      lastActivityAt: now,
    });

    await expect(getRoom(kv, TEST_CODE)).rejects.toBeInstanceOf(RoomStateCorruptionError);
  });

  it('rejects a short seat array instead of padding it', async () => {
    await kv.set(`room:${TEST_CODE}:seats`, JSON.stringify([]));

    await expect(getRoomSeats(kv, TEST_CODE)).rejects.toBeInstanceOf(RoomStateCorruptionError);
  });

  it('rejects malformed seat and spectator entries', async () => {
    const seats = Array.from({ length: 10 }, () => null) as unknown[];
    seats[0] = { userId: 'p1', nickname: 'Alice' };
    await kv.set(`room:${TEST_CODE}:seats`, JSON.stringify(seats));
    await kv.set(`room:${TEST_CODE}:spectators`, JSON.stringify([{ userId: 'p2', nickname: 'Bob' }]));

    await expect(getRoomSeats(kv, TEST_CODE)).rejects.toBeInstanceOf(RoomStateCorruptionError);
    await expect(getRoomSpectators(kv, TEST_CODE)).rejects.toBeInstanceOf(RoomStateCorruptionError);
  });

  it('rejects seat and spectator roles outside the current role schema', async () => {
    const seats = Array.from({ length: 10 }, () => null) as unknown[];
    seats[0] = { ...makePlayer('p1', 'Alice'), role: 'legacy-role' };
    await kv.set(`room:${TEST_CODE}:seats`, JSON.stringify(seats));
    await kv.set(
      `room:${TEST_CODE}:spectators`,
      JSON.stringify([{ ...makeSpectator('p2', 'Bob', true), role: 'legacy-role' }]),
    );

    await expect(getRoomSeats(kv, TEST_CODE)).rejects.toBeInstanceOf(RoomStateCorruptionError);
    await expect(getRoomSpectators(kv, TEST_CODE)).rejects.toBeInstanceOf(RoomStateCorruptionError);
  });

  it('requires botConfig exactly for server-controlled bot seats', async () => {
    const botWithoutConfig = Array.from({ length: 10 }, () => null) as unknown[];
    botWithoutConfig[0] = { ...makePlayer('bot-1', 'Bot'), isBot: true };
    await kv.set(`room:${TEST_CODE}:seats`, JSON.stringify(botWithoutConfig));
    await expect(getRoomSeats(kv, TEST_CODE)).rejects.toBeInstanceOf(RoomStateCorruptionError);

    const humanWithConfig = Array.from({ length: 10 }, () => null) as unknown[];
    humanWithConfig[0] = {
      ...makePlayer('p1', 'Alice'),
      botConfig: { difficulty: 'normal', personality: 'balanced' },
    };
    await kv.set(`room:${TEST_CODE}:seats`, JSON.stringify(humanWithConfig));
    await expect(getRoomSeats(kv, TEST_CODE)).rejects.toBeInstanceOf(RoomStateCorruptionError);
  });

  it.each([Number.NaN, 1.5])('rejects non-integer seat index %s without mutating the roster', async seatIndex => {
    const player = makePlayer('p1', 'Alice');
    await expect(takeSeat(kv, TEST_CODE, seatIndex, player)).rejects.toThrow('无效座位编号');
    expect(getSeatedPlayers(await getRoomSeats(kv, TEST_CODE))).toEqual([]);

    await addSpectatorToRoom(kv, TEST_CODE, makeSpectator('p1', 'Alice', true));
    await expect(moveSpectatorToSeat(kv, TEST_CODE, seatIndex, player)).rejects.toThrow('无效座位编号');
    expect(getSeatedPlayers(await getRoomSeats(kv, TEST_CODE))).toEqual([]);
    expect(await getRoomSpectators(kv, TEST_CODE)).toEqual([makeSpectator('p1', 'Alice', true)]);
  });

  it('adds and lists players via seats', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', TEST_SETTINGS);
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));
    await takeSeat(kv, TEST_CODE, 1, makePlayer('p2', 'Bob'));

    const seats = await getRoomSeats(kv, TEST_CODE);
    const players = getSeatedPlayers(seats);
    expect(players).toHaveLength(2);
    expect(players[0]!.userId).toBe('p1');
    expect(players[1]!.userId).toBe('p2');
  });

  it('sets player ready', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', TEST_SETTINGS);
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));

    await setSeatPlayerReady(kv, TEST_CODE, 'p1', true);
    const seats = await getRoomSeats(kv, TEST_CODE);
    const players = getSeatedPlayers(seats);
    expect(players[0]!.ready).toBe(true);
  });

  it('deletes a room and its players', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', TEST_SETTINGS);
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));

    await deleteRoom(kv, TEST_CODE);
    const room = await getRoom(kv, TEST_CODE);
    expect(room).toBeNull();
  });

  it('moves a member between a seat and spectator roster without duplicate membership', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', TEST_SETTINGS);
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));

    await moveSeatToSpectator(kv, TEST_CODE, 'p1', makeSpectator('p1', 'Alice', false));
    expect(getSeatedPlayers(await getRoomSeats(kv, TEST_CODE))).toEqual([]);
    expect(await getRoomSpectators(kv, TEST_CODE)).toHaveLength(1);
    await moveSpectatorToSeat(kv, TEST_CODE, 1, makePlayer('p1', 'Alice'));
    expect((await getRoomSeats(kv, TEST_CODE))[1]?.userId).toBe('p1');
    expect(await getRoomSpectators(kv, TEST_CODE)).toEqual([]);
  });

  it('keeps both roster keys unchanged when an atomic move fails', async () => {
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));
    await addSpectatorToRoom(kv, TEST_CODE, makeSpectator('p2', 'Bob', true));
    const oldSeats = await kv.get(`room:${TEST_CODE}:seats`);
    const oldSpectators = await kv.get(`room:${TEST_CODE}:spectators`);
    vi.spyOn(kv, 'batchStrings').mockRejectedValueOnce(new Error('injected batch failure'));

    await expect(moveSeatToSpectator(kv, TEST_CODE, 'p1', makeSpectator('p1', 'Alice', false))).rejects.toThrow(
      'injected batch failure',
    );
    expect(await kv.get(`room:${TEST_CODE}:seats`)).toBe(oldSeats);
    expect(await kv.get(`room:${TEST_CODE}:spectators`)).toBe(oldSpectators);

    // The old Promise.all implementation could reject before its sibling
    // write settled. Flushing a continuation proves no late branch remains.
    await Promise.resolve();
    expect(await kv.get(`room:${TEST_CODE}:seats`)).toBe(oldSeats);
    expect(await kv.get(`room:${TEST_CODE}:spectators`)).toBe(oldSpectators);
  });

  it('uses one atomic batch when replacing the complete roster', async () => {
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));
    const batch = vi.spyOn(kv, 'batchStrings');

    await replaceRosterWithSpectators(kv, TEST_CODE, [
      makeSpectator('p1', 'Alice', false),
      makeSpectator('p2', 'Bob', true),
    ]);

    expect(batch).toHaveBeenCalledTimes(1);
    expect(getSeatedPlayers(await getRoomSeats(kv, TEST_CODE))).toEqual([]);
    expect(await getRoomSpectators(kv, TEST_CODE)).toEqual([
      makeSpectator('p1', 'Alice', false),
      makeSpectator('p2', 'Bob', true),
    ]);
  });

  it('removes a seated member atomically', async () => {
    await takeSeat(kv, TEST_CODE, 2, makePlayer('p1', 'Alice'));
    const batch = vi.spyOn(kv, 'batchStrings');

    await expect(removeMemberFromRoomRoster(kv, TEST_CODE, 'p1')).resolves.toEqual({
      seatIndex: 2,
      spectatorNickname: null,
    });
    expect(batch).toHaveBeenCalledTimes(1);
    expect(getSeatedPlayers(await getRoomSeats(kv, TEST_CODE))).toEqual([]);
    expect(await getRoomSpectators(kv, TEST_CODE)).toEqual([]);
  });

  it('commits a new spectator roster and reverse mapping in one batch', async () => {
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));
    const batch = vi.spyOn(kv, 'batchStrings');

    await addSpectatorWithMembership(kv, TEST_CODE, makeSpectator('p2', 'Bob', true));

    expect(batch).toHaveBeenCalledTimes(1);
    expect((await getRoomSpectators(kv, TEST_CODE)).map(item => item.userId)).toEqual(['p2']);
    expect(await getUserRoom(kv, 'p2')).toBe(TEST_CODE);
  });

  it('accepts a spectator membership batch whose commit response is lost', async () => {
    const originalBatch = kv.batchStrings.bind(kv);
    vi.spyOn(kv, 'batchStrings').mockImplementationOnce(async operations => {
      await originalBatch(operations);
      throw new Error('injected lost EXEC response');
    });

    await expect(addSpectatorWithMembership(kv, TEST_CODE, makeSpectator('p2', 'Bob', true))).resolves.toMatchObject({
      spectators: [expect.objectContaining({ userId: 'p2' })],
    });
    expect(await getUserRoom(kv, 'p2')).toBe(TEST_CODE);
  });

  it('keeps roster and reverse mapping unchanged when atomic membership removal fails', async () => {
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));
    await addSpectatorWithMembership(kv, TEST_CODE, makeSpectator('p2', 'Bob', true));
    const oldSeats = await kv.get(`room:${TEST_CODE}:seats`);
    const oldSpectators = await kv.get(`room:${TEST_CODE}:spectators`);
    vi.spyOn(kv, 'batchStrings').mockRejectedValueOnce(new Error('injected membership failure'));

    await expect(removeMemberWithMembership(kv, TEST_CODE, 'p2')).rejects.toThrow('injected membership failure');
    expect(await kv.get(`room:${TEST_CODE}:seats`)).toBe(oldSeats);
    expect(await kv.get(`room:${TEST_CODE}:spectators`)).toBe(oldSpectators);
    expect(await getUserRoom(kv, 'p2')).toBe(TEST_CODE);
  });

  it('accepts a membership removal whose atomic commit response is lost', async () => {
    await addSpectatorWithMembership(kv, TEST_CODE, makeSpectator('p2', 'Bob', true));
    const originalBatch = kv.batchStrings.bind(kv);
    vi.spyOn(kv, 'batchStrings').mockImplementationOnce(async operations => {
      await originalBatch(operations);
      throw new Error('injected lost EXEC response');
    });

    await expect(removeMemberWithMembership(kv, TEST_CODE, 'p2')).resolves.toMatchObject({
      spectatorNickname: 'Bob',
      mappingCleared: true,
    });
    expect(await getRoomSpectators(kv, TEST_CODE)).toEqual([]);
    expect(await getUserRoom(kv, 'p2')).toBeNull();
  });

  it('does not clear a newer mapping while removing stale roster membership', async () => {
    await addSpectatorToRoom(kv, TEST_CODE, makeSpectator('p2', 'Bob', false));
    await setUserRoom(kv, 'p2', 'NEW001');

    await expect(removeMemberWithMembership(kv, TEST_CODE, 'p2')).resolves.toMatchObject({
      spectatorNickname: 'Bob',
      mappingCleared: false,
    });
    expect(await getRoomSpectators(kv, TEST_CODE)).toEqual([]);
    expect(await getUserRoom(kv, 'p2')).toBe('NEW001');
  });

  it('commits active seat connectivity and departure intent in one batch', async () => {
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));
    const batch = vi.spyOn(kv, 'batchStrings');

    await setSeatConnectionAndDeparture(kv, TEST_CODE, 'p1', false, true);

    expect(batch).toHaveBeenCalledTimes(1);
    expect((await getRoomSeats(kv, TEST_CODE))[0]).toMatchObject({
      userId: 'p1',
      connected: false,
      ready: false,
    });
    expect(JSON.parse((await kv.get(`room:${TEST_CODE}:departed`))!)).toEqual(['p1']);
  });

  it('rejects corrupt departure state instead of overwriting it during a seat update', async () => {
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));
    await kv.set(`room:${TEST_CODE}:departed`, '{');
    const batch = vi.spyOn(kv, 'batchStrings');

    await expect(setSeatConnectionAndDeparture(kv, TEST_CODE, 'p1', false, true)).rejects.toBeInstanceOf(
      RoomDepartureCorruptionError,
    );
    expect(batch).not.toHaveBeenCalled();
    expect((await getRoomSeats(kv, TEST_CODE))[0]).toMatchObject({
      userId: 'p1',
      connected: true,
    });
    expect(await kv.get(`room:${TEST_CODE}:departed`)).toBe('{');
  });

  it('does not expose a departure marker when the active suspension batch fails', async () => {
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));
    const oldSeats = await kv.get(`room:${TEST_CODE}:seats`);
    vi.spyOn(kv, 'batchStrings').mockRejectedValueOnce(new Error('injected suspension failure'));

    await expect(setSeatConnectionAndDeparture(kv, TEST_CODE, 'p1', false, true)).rejects.toThrow(
      'injected suspension failure',
    );
    expect(await kv.get(`room:${TEST_CODE}:seats`)).toBe(oldSeats);
    expect(await kv.get(`room:${TEST_CODE}:departed`)).toBeNull();
  });

  it('only clears a user mapping when it still belongs to the expected room', async () => {
    await setUserRoom(kv, 'mapping-user', 'NEW001');
    expect(await clearUserRoomIfMatches(kv, 'mapping-user', 'OLD001')).toBe(false);
    expect(await getUserRoom(kv, 'mapping-user')).toBe('NEW001');
    expect(await clearUserRoomIfMatches(kv, 'mapping-user', 'NEW001')).toBe(true);
    expect(await getUserRoom(kv, 'mapping-user')).toBeNull();
  });

  it('does not let a stale owner transfer overwrite a newer owner', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', TEST_SETTINGS);
    expect(await setRoomOwnerIfMatches(kv, TEST_CODE, 'owner-1', 'owner-2')).toBe(true);
    expect(await setRoomOwnerIfMatches(kv, TEST_CODE, 'owner-1', 'owner-3')).toBe(false);
    expect((await getRoom(kv, TEST_CODE))?.ownerId).toBe('owner-2');
  });

  it('acknowledges an owner transfer whose HSET committed before its response was lost', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', TEST_SETTINGS);
    const realHset = kv.hset.bind(kv);
    vi.spyOn(kv, 'hset').mockImplementationOnce(async (key, values) => {
      await realHset(key, values);
      throw new Error('injected committed response loss');
    });

    await expect(setRoomOwnerIfMatches(kv, TEST_CODE, 'owner-1', 'owner-2')).resolves.toBe(true);
    expect((await getRoom(kv, TEST_CODE))?.ownerId).toBe('owner-2');
  });

  it('still rejects an owner transfer whose HSET did not commit', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', TEST_SETTINGS);
    vi.spyOn(kv, 'hset').mockRejectedValueOnce(new Error('injected owner write failure'));

    await expect(setRoomOwnerIfMatches(kv, TEST_CODE, 'owner-1', 'owner-2')).rejects.toThrow(
      'injected owner write failure',
    );
    expect((await getRoom(kv, TEST_CODE))?.ownerId).toBe('owner-1');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

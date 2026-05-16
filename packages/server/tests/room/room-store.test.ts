import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import {
  createRoom,
  getRoom,
  deleteRoom,
  getRoomSeats,
  takeSeat,
  leaveSeat,
  setSeatPlayerReady,
  getSeatedPlayers,
} from '../../src/plugins/core/room/store';
import type { RoomSeatPlayer } from '../../src/plugins/core/room/store';

const kv = new MemoryKvStore();
const TEST_CODE = 'TEST01';

function makePlayer(userId: string, username: string): RoomSeatPlayer {
  return { userId, nickname: username, avatarUrl: null, ready: false, connected: true, role: 'normal', isBot: false };
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
    await createRoom(kv, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    const room = await getRoom(kv, TEST_CODE);
    expect(room).not.toBeNull();
    expect(room!.ownerId).toBe('owner-1');
    expect(room!.status).toBe('waiting');
  });

  it('adds and lists players via seats', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));
    await takeSeat(kv, TEST_CODE, 1, makePlayer('p2', 'Bob'));

    const seats = await getRoomSeats(kv, TEST_CODE);
    const players = getSeatedPlayers(seats);
    expect(players).toHaveLength(2);
    expect(players[0]!.userId).toBe('p1');
    expect(players[1]!.userId).toBe('p2');
  });

  it('removes a player from their seat', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));
    await takeSeat(kv, TEST_CODE, 1, makePlayer('p2', 'Bob'));

    await leaveSeat(kv, TEST_CODE, 'p1');
    const seats = await getRoomSeats(kv, TEST_CODE);
    const players = getSeatedPlayers(seats);
    expect(players).toHaveLength(1);
    expect(players[0]!.userId).toBe('p2');
  });

  it('sets player ready', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));

    await setSeatPlayerReady(kv, TEST_CODE, 'p1', true);
    const seats = await getRoomSeats(kv, TEST_CODE);
    const players = getSeatedPlayers(seats);
    expect(players[0]!.ready).toBe(true);
  });

  it('deletes a room and its players', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await takeSeat(kv, TEST_CODE, 0, makePlayer('p1', 'Alice'));

    await deleteRoom(kv, TEST_CODE);
    const room = await getRoom(kv, TEST_CODE);
    expect(room).toBeNull();
  });
});

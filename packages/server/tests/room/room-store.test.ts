import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Redis from 'ioredis';
import {
  createRoom,
  getRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  getRoomPlayers,
  setPlayerReady,
  deleteRoom,
} from '../../src/room/room-store.js';

const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
const TEST_CODE = 'TEST01';

beforeEach(async () => {
  const keys = await redis.keys(`room:${TEST_CODE}*`);
  if (keys.length > 0) await redis.del(...keys);
});

afterAll(async () => {
  const keys = await redis.keys(`room:${TEST_CODE}*`);
  if (keys.length > 0) await redis.del(...keys);
  await redis.quit();
});

describe('room-store', () => {
  it('creates and retrieves a room', async () => {
    await createRoom(redis, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    const room = await getRoom(redis, TEST_CODE);
    expect(room).not.toBeNull();
    expect(room!.ownerId).toBe('owner-1');
    expect(room!.status).toBe('waiting');
  });

  it('adds and lists players', async () => {
    await createRoom(redis, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await addPlayerToRoom(redis, TEST_CODE, { userId: 'p1', username: 'Alice' });
    await addPlayerToRoom(redis, TEST_CODE, { userId: 'p2', username: 'Bob' });

    const players = await getRoomPlayers(redis, TEST_CODE);
    expect(players).toHaveLength(2);
    expect(players[0]!.userId).toBe('p1');
    expect(players[1]!.userId).toBe('p2');
  });

  it('removes a player', async () => {
    await createRoom(redis, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await addPlayerToRoom(redis, TEST_CODE, { userId: 'p1', username: 'Alice' });
    await addPlayerToRoom(redis, TEST_CODE, { userId: 'p2', username: 'Bob' });

    await removePlayerFromRoom(redis, TEST_CODE, 'p1');
    const players = await getRoomPlayers(redis, TEST_CODE);
    expect(players).toHaveLength(1);
    expect(players[0]!.userId).toBe('p2');
  });

  it('sets player ready', async () => {
    await createRoom(redis, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await addPlayerToRoom(redis, TEST_CODE, { userId: 'p1', username: 'Alice' });

    await setPlayerReady(redis, TEST_CODE, 'p1', true);
    const players = await getRoomPlayers(redis, TEST_CODE);
    expect(players[0]!.ready).toBe(true);
  });

  it('deletes a room and its players', async () => {
    await createRoom(redis, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await addPlayerToRoom(redis, TEST_CODE, { userId: 'p1', username: 'Alice' });

    await deleteRoom(redis, TEST_CODE);
    const room = await getRoom(redis, TEST_CODE);
    expect(room).toBeNull();
  });
});

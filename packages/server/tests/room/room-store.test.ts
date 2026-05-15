import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import {
  createRoom,
  getRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  getRoomPlayers,
  setPlayerReady,
  deleteRoom,
} from '../../src/plugins/core/room/store';

const kv = new MemoryKvStore();
const TEST_CODE = 'TEST01';

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

  it('adds and lists players', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await addPlayerToRoom(kv, TEST_CODE, { userId: 'p1', username: 'Alice' });
    await addPlayerToRoom(kv, TEST_CODE, { userId: 'p2', username: 'Bob' });

    const players = await getRoomPlayers(kv, TEST_CODE);
    expect(players).toHaveLength(2);
    expect(players[0]!.userId).toBe('p1');
    expect(players[1]!.userId).toBe('p2');
  });

  it('removes a player', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await addPlayerToRoom(kv, TEST_CODE, { userId: 'p1', username: 'Alice' });
    await addPlayerToRoom(kv, TEST_CODE, { userId: 'p2', username: 'Bob' });

    await removePlayerFromRoom(kv, TEST_CODE, 'p1');
    const players = await getRoomPlayers(kv, TEST_CODE);
    expect(players).toHaveLength(1);
    expect(players[0]!.userId).toBe('p2');
  });

  it('sets player ready', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await addPlayerToRoom(kv, TEST_CODE, { userId: 'p1', username: 'Alice' });

    await setPlayerReady(kv, TEST_CODE, 'p1', true);
    const players = await getRoomPlayers(kv, TEST_CODE);
    expect(players[0]!.ready).toBe(true);
  });

  it('deletes a room and its players', async () => {
    await createRoom(kv, TEST_CODE, 'owner-1', { turnTimeLimit: 30, targetScore: 500 });
    await addPlayerToRoom(kv, TEST_CODE, { userId: 'p1', username: 'Alice' });

    await deleteRoom(kv, TEST_CODE);
    const room = await getRoom(kv, TEST_CODE);
    expect(room).toBeNull();
  });
});

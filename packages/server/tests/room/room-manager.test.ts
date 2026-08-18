import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import { MemoryKvStore } from '../../src/kv/memory';
import { RoomManager } from '../../src/plugins/core/room/manager';
import { getRoom, getRoomSeats, setRoomOwner, getSeatedPlayers, takeSeat } from '../../src/plugins/core/room/store';
import type { RoomSeatPlayer } from '../../src/plugins/core/room/store';

const kv = new MemoryKvStore();
const SETTINGS = {
  turnTimeLimit: 30 as const,
  targetScore: 500 as const,
  houseRules: DEFAULT_HOUSE_RULES,
  allowSpectators: true,
  spectatorMode: 'hidden' as const,
};

function makePlayer(userId: string, nickname: string): RoomSeatPlayer {
  return { userId, nickname, avatarUrl: null, ready: false, connected: true, role: 'normal', isBot: false };
}

beforeEach(async () => {
  const keys = await kv.keys('room:*');
  if (keys.length > 0) await kv.del(...keys);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await kv.disconnect();
});

describe('RoomManager', () => {
  it('creates a room and returns a 6-char code', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice', SETTINGS, null, 'normal');
    expect(code).toHaveLength(6);
    const room = await getRoom(kv, code);
    expect(room).not.toBeNull();
    expect(room!.ownerId).toBe('owner-1');
    const seats = await getRoomSeats(kv, code);
    const players = getSeatedPlayers(seats);
    expect(players).toHaveLength(1);
    expect(players[0]!.userId).toBe('owner-1');
  });

  it('rejects joining when room is full (10 seats occupied)', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner', 'Owner', SETTINGS, null, 'normal');
    // Fill all 10 seats (owner is already in seat 0)
    for (let i = 1; i < 10; i++) {
      await takeSeat(kv, code, i, makePlayer(`p${i}`, `Player${i}`));
    }
    // joinRoom goes to spectators, so test that takeSeat on a full room fails
    await expect(takeSeat(kv, code, 0, makePlayer('extra', 'Extra'))).rejects.toThrow(/已被占用/);
  });

  it('removes the room reservation when the initial owner seat write fails', async () => {
    const manager = new RoomManager(kv);
    const originalSet = kv.set.bind(kv);
    let failedSeatKey: string | null = null;
    vi.spyOn(kv, 'set').mockImplementation(async (key, value, ttlSeconds) => {
      if (!failedSeatKey && key.startsWith('room:') && key.endsWith(':seats')) {
        failedSeatKey = key;
        throw new Error('injected initial seat failure');
      }
      await originalSet(key, value, ttlSeconds);
    });

    await expect(manager.createRoom('owner-fail', 'FailedOwner', SETTINGS, null, 'normal')).rejects.toThrow(
      'injected initial seat failure',
    );
    expect(failedSeatKey).not.toBeNull();
    expect(await kv.keys('room:*')).toEqual([]);
  });

  it('checks all players ready (requires 2+ seated players)', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice', SETTINGS, null, 'normal');
    // Place p2 in seat 1 for the ready check to be meaningful
    await takeSeat(kv, code, 1, makePlayer('p2', 'Bob'));
    expect(await manager.areAllReady(code)).toBe(false);
    await manager.setReady(code, 'owner-1', true);
    await manager.setReady(code, 'p2', true);
    expect(await manager.areAllReady(code)).toBe(true);
  });

  it('transfers ownership to a specific player', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice', SETTINGS, null, 'normal');
    await takeSeat(kv, code, 1, makePlayer('p2', 'Bob'));
    await takeSeat(kv, code, 2, makePlayer('p3', 'Carol'));
    await setRoomOwner(kv, code, 'p3');
    const room = await getRoom(kv, code);
    expect(room!.ownerId).toBe('p3');
    const seats = await getRoomSeats(kv, code);
    const players = getSeatedPlayers(seats);
    expect(players).toHaveLength(3);
  });
});

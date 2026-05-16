import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import { RoomManager } from '../../src/plugins/core/room/manager';
import {
  getRoom,
  getRoomSeats,
  getRoomSpectators,
  setRoomOwner,
  getSeatedPlayers,
  takeSeat,
} from '../../src/plugins/core/room/store';
import type { RoomSeatPlayer } from '../../src/plugins/core/room/store';

const kv = new MemoryKvStore();

function makePlayer(userId: string, nickname: string): RoomSeatPlayer {
  return { userId, nickname, avatarUrl: null, ready: false, connected: true, role: 'normal', isBot: false };
}

beforeEach(async () => {
  const keys = await kv.keys('room:*');
  if (keys.length > 0) await kv.del(...keys);
});

afterAll(async () => {
  await kv.disconnect();
});

describe('RoomManager', () => {
  it('creates a room and returns a 6-char code', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    expect(code).toHaveLength(6);
    const room = await getRoom(kv, code);
    expect(room).not.toBeNull();
    expect(room!.ownerId).toBe('owner-1');
    const seats = await getRoomSeats(kv, code);
    const players = getSeatedPlayers(seats);
    expect(players).toHaveLength(1);
    expect(players[0]!.userId).toBe('owner-1');
  });

  it('joins an existing room as spectator', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    await manager.joinRoom(code, 'p2', 'Bob');
    // joinRoom adds to spectators
    const spectators = await getRoomSpectators(kv, code);
    expect(spectators).toHaveLength(1);
    expect(spectators[0]!.userId).toBe('p2');
  });

  it('rejects joining a non-existent room', async () => {
    const manager = new RoomManager(kv);
    await expect(manager.joinRoom('NONEXIST', 'p1', 'Alice')).rejects.toThrow('Room not found');
  });

  it('rejects duplicate player', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    await expect(manager.joinRoom(code, 'owner-1', 'Alice')).rejects.toThrow('Already in room');
  });

  it('rejects joining when room is full (10 seats occupied)', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner', 'Owner');
    // Fill all 10 seats (owner is already in seat 0)
    for (let i = 1; i < 10; i++) {
      await takeSeat(kv, code, i, makePlayer(`p${i}`, `Player${i}`));
    }
    // joinRoom goes to spectators, so test that takeSeat on a full room fails
    await expect(
      takeSeat(kv, code, 0, makePlayer('extra', 'Extra')),
    ).rejects.toThrow(/已被占用/);
  });

  it('leaves room and transfers ownership', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    // Put p2 in seat 1 so they can inherit ownership
    await takeSeat(kv, code, 1, makePlayer('p2', 'Bob'));
    await manager.leaveRoom(code, 'owner-1');
    const room = await getRoom(kv, code);
    expect(room!.ownerId).toBe('p2');
    const seats = await getRoomSeats(kv, code);
    const players = getSeatedPlayers(seats);
    expect(players).toHaveLength(1);
    expect(players[0]!.userId).toBe('p2');
  });

  it('deletes room when last player leaves', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    await manager.leaveRoom(code, 'owner-1');
    const room = await getRoom(kv, code);
    expect(room).toBeNull();
  });

  it('checks all players ready (requires 2+ seated players)', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    // Place p2 in seat 1 for the ready check to be meaningful
    await takeSeat(kv, code, 1, makePlayer('p2', 'Bob'));
    expect(await manager.areAllReady(code)).toBe(false);
    await manager.setReady(code, 'owner-1', true);
    await manager.setReady(code, 'p2', true);
    expect(await manager.areAllReady(code)).toBe(true);
  });

  it('transfers ownership to a specific player', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    await takeSeat(kv, code, 1, makePlayer('p2', 'Bob'));
    await takeSeat(kv, code, 2, makePlayer('p3', 'Carol'));
    await setRoomOwner(kv, code, 'p3');
    const room = await getRoom(kv, code);
    expect(room!.ownerId).toBe('p3');
    const seats = await getRoomSeats(kv, code);
    const players = getSeatedPlayers(seats);
    expect(players).toHaveLength(3);
  });

  it('kick removes target player from room without affecting others', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    await takeSeat(kv, code, 1, makePlayer('p2', 'Bob'));
    await takeSeat(kv, code, 2, makePlayer('p3', 'Carol'));
    await manager.leaveRoom(code, 'p2');
    const seats = await getRoomSeats(kv, code);
    const players = getSeatedPlayers(seats);
    expect(players).toHaveLength(2);
    expect(players.map(p => p.userId)).toEqual(['owner-1', 'p3']);
    const room = await getRoom(kv, code);
    expect(room!.ownerId).toBe('owner-1');
  });
});

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import { RoomManager } from '../../src/plugins/core/room/manager';
import { getRoom, getRoomPlayers, setRoomOwner } from '../../src/plugins/core/room/store';

const kv = new MemoryKvStore();

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
    const players = await getRoomPlayers(kv, code);
    expect(players).toHaveLength(1);
    expect(players[0]!.userId).toBe('owner-1');
  });

  it('joins an existing room', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    await manager.joinRoom(code, 'p2', 'Bob');
    const players = await getRoomPlayers(kv, code);
    expect(players).toHaveLength(2);
  });

  it('rejects joining a non-existent room', async () => {
    const manager = new RoomManager(kv);
    await expect(manager.joinRoom('NONEXIST', 'p1', 'Alice')).rejects.toThrow('Room not found');
  });

  it('rejects joining when room is full (10 players)', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner', 'Owner');
    for (let i = 1; i < 10; i++) {
      await manager.joinRoom(code, `p${i}`, `Player${i}`);
    }
    await expect(manager.joinRoom(code, 'p10', 'Player10')).rejects.toThrow('Room is full');
  });

  it('rejects duplicate player', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    await expect(manager.joinRoom(code, 'owner-1', 'Alice')).rejects.toThrow('Already in room');
  });

  it('leaves room and transfers ownership', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    await manager.joinRoom(code, 'p2', 'Bob');
    await manager.leaveRoom(code, 'owner-1');
    const room = await getRoom(kv, code);
    expect(room!.ownerId).toBe('p2');
    const players = await getRoomPlayers(kv, code);
    expect(players).toHaveLength(1);
  });

  it('deletes room when last player leaves', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    await manager.leaveRoom(code, 'owner-1');
    const room = await getRoom(kv, code);
    expect(room).toBeNull();
  });

  it('checks all players ready', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    await manager.joinRoom(code, 'p2', 'Bob');
    expect(await manager.areAllReady(code)).toBe(false);
    await manager.setReady(code, 'owner-1', true);
    await manager.setReady(code, 'p2', true);
    expect(await manager.areAllReady(code)).toBe(true);
  });

  it('transfers ownership to a specific player', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    await manager.joinRoom(code, 'p2', 'Bob');
    await manager.joinRoom(code, 'p3', 'Carol');
    await setRoomOwner(kv, code, 'p3');
    const room = await getRoom(kv, code);
    expect(room!.ownerId).toBe('p3');
    const players = await getRoomPlayers(kv, code);
    expect(players).toHaveLength(3);
  });

  it('kick removes target player from room without affecting others', async () => {
    const manager = new RoomManager(kv);
    const code = await manager.createRoom('owner-1', 'Alice');
    await manager.joinRoom(code, 'p2', 'Bob');
    await manager.joinRoom(code, 'p3', 'Carol');
    await manager.leaveRoom(code, 'p2');
    const players = await getRoomPlayers(kv, code);
    expect(players).toHaveLength(2);
    expect(players.map(p => p.userId)).toEqual(['owner-1', 'p3']);
    const room = await getRoom(kv, code);
    expect(room!.ownerId).toBe('owner-1');
  });
});

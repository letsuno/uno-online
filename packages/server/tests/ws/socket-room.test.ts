import { describe, expect, it, vi } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory.js';
import { getUserRoom, setUserRoom } from '../../src/plugins/core/room/store.js';
import { joinRoomSocket, leaveRoomSocket } from '../../src/ws/socket-room.js';

function makeSocket(roomCode: string | null, isSpectator = false) {
  return {
    data: {
      user: { userId: 'socket-user', nickname: 'Socket User' },
      roomCode,
      isSpectator,
    },
    join: vi.fn(),
    leave: vi.fn(),
  };
}

describe('leaveRoomSocket', () => {
  it('does not erase a newer room membership while cleaning up an old room', async () => {
    const kv = new MemoryKvStore();
    const socket = makeSocket('NEW001', true);
    await setUserRoom(kv, 'socket-user', 'NEW001');

    await leaveRoomSocket(kv, socket, 'OLD001');

    expect(socket.leave).toHaveBeenCalledWith('OLD001');
    expect(socket.data.roomCode).toBe('NEW001');
    expect(socket.data.isSpectator).toBe(true);
    expect(await getUserRoom(kv, 'socket-user')).toBe('NEW001');
  });

  it('clears in-memory and reverse membership when cleaning the current room', async () => {
    const kv = new MemoryKvStore();
    const socket = makeSocket('ROOM01', true);
    await setUserRoom(kv, 'socket-user', 'ROOM01');

    await leaveRoomSocket(kv, socket, 'ROOM01');

    expect(socket.data.roomCode).toBeNull();
    expect(socket.data.isSpectator).toBe(false);
    expect(await getUserRoom(kv, 'socket-user')).toBeNull();
  });

  it('restores the reverse membership when adapter leave fails', async () => {
    const kv = new MemoryKvStore();
    const socket = makeSocket('ROOM02', true);
    socket.leave.mockRejectedValueOnce(new Error('adapter leave failed'));
    await setUserRoom(kv, 'socket-user', 'ROOM02');

    await expect(leaveRoomSocket(kv, socket, 'ROOM02')).rejects.toThrow('adapter leave failed');
    expect(socket.data.roomCode).toBe('ROOM02');
    expect(socket.data.isSpectator).toBe(true);
    expect(await getUserRoom(kv, 'socket-user')).toBe('ROOM02');
  });
});

describe('joinRoomSocket', () => {
  it('removes adapter membership when the durable mapping write fails', async () => {
    const kv = new MemoryKvStore();
    const originalSet = kv.set.bind(kv);
    kv.set = async (key, value, ttlSeconds) => {
      if (key === 'user:socket-user:room') throw new Error('mapping write failed');
      await originalSet(key, value, ttlSeconds);
    };
    const socket = makeSocket(null);

    await expect(joinRoomSocket(kv, socket, 'ROOM03')).rejects.toThrow('mapping write failed');
    expect(socket.join).toHaveBeenCalledWith('ROOM03');
    expect(socket.leave).toHaveBeenCalledWith('ROOM03');
    expect(socket.data.roomCode).toBeNull();
    expect(await getUserRoom(kv, 'socket-user')).toBeNull();
  });

  it('restores the prior adapter room when joining the replacement room fails', async () => {
    const kv = new MemoryKvStore();
    const socket = makeSocket('OLD003', true);
    socket.join.mockRejectedValueOnce(new Error('adapter join failed'));
    await setUserRoom(kv, 'socket-user', 'OLD003');

    await expect(joinRoomSocket(kv, socket, 'NEW003')).rejects.toThrow('adapter join failed');
    expect(socket.leave).toHaveBeenCalledWith('OLD003');
    expect(socket.join).toHaveBeenLastCalledWith('OLD003');
    expect(socket.data.roomCode).toBe('OLD003');
    expect(socket.data.isSpectator).toBe(true);
    expect(await getUserRoom(kv, 'socket-user')).toBe('OLD003');
  });
});

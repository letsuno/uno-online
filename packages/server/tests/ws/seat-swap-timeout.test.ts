import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import { MemoryKvStore } from '../../src/kv/memory.js';
import { createRoom, takeSeat } from '../../src/plugins/core/room/store.js';
import { clearPendingSwapRequests, registerSeatEvents } from '../../src/ws/seat-events.js';
import { FakeSocket, type Emitted } from '../helpers/fake-io.js';
import type { Server as SocketIOServer } from 'socket.io';

afterEach(() => {
  vi.restoreAllMocks();
  clearPendingSwapRequests('SWAP01');
});

describe('seat swap timeout identity', () => {
  it('a cleared old timeout cannot delete or reject a newer request for the same target', async () => {
    const kv = new MemoryKvStore();
    await createRoom(kv, 'SWAP01', 'requester-1', {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    });
    await takeSeat(kv, 'SWAP01', 0, {
      userId: 'requester-1',
      nickname: 'R1',
      avatarUrl: null,
      role: 'normal',
      ready: false,
      connected: true,
      isBot: false,
    });
    await takeSeat(kv, 'SWAP01', 1, {
      userId: 'target',
      nickname: 'Target',
      avatarUrl: null,
      role: 'normal',
      ready: false,
      connected: true,
      isBot: false,
    });
    await takeSeat(kv, 'SWAP01', 2, {
      userId: 'requester-2',
      nickname: 'R2',
      avatarUrl: null,
      role: 'normal',
      ready: false,
      connected: true,
      isBot: false,
    });

    const emitted: Emitted[] = [];
    const requester1 = new FakeSocket('requester-1', 'R1', emitted);
    const requester2 = new FakeSocket('requester-2', 'R2', emitted);
    const target = new FakeSocket('target', 'Target', emitted);
    for (const socket of [requester1, requester2, target]) {
      socket.data.roomCode = 'SWAP01';
      socket.rooms.add('SWAP01');
    }
    const sockets = [requester1, requester2, target];
    const io = {
      to: (roomCode: string) => ({
        emit: (event: string, payload: unknown) => emitted.push({ target: roomCode, event, payload }),
      }),
      in: (roomCode: string) => ({
        fetchSockets: async () => sockets.filter(socket => socket.rooms.has(roomCode)),
      }),
    } as unknown as SocketIOServer;
    registerSeatEvents(requester1 as never, io, kv);
    registerSeatEvents(requester2 as never, io, kv);
    registerSeatEvents(target as never, io, kv);

    const timeoutCallbacks: Array<() => void> = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      timeoutCallbacks.push(callback);
      return { unref() {} };
    }) as typeof setTimeout);
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => {});

    expect((await requester1.call('seat:swap_request', 'target')).success).toBe(true);
    clearPendingSwapRequests('SWAP01');
    expect((await requester2.call('seat:swap_request', 'target')).success).toBe(true);

    timeoutCallbacks[0]!();

    expect(emitted.filter(item => item.event === 'seat:swap_resolved')).toHaveLength(0);
    expect(await target.call('seat:swap_respond', { requesterId: 'requester-2', accept: false })).toMatchObject({
      success: true,
    });
  });
});

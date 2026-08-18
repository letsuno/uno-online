import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import type { Server as SocketIOServer } from 'socket.io';
import { MemoryKvStore } from '../../src/kv/memory.js';
import {
  createRoom,
  getRoomStorageKeys,
  getRoom,
  getUserRoom,
  setUserRoom,
} from '../../src/plugins/core/room/store.js';
import { GameStatePersister, loadGameState } from '../../src/plugins/core/game/state-store.js';
import { GameSession } from '../../src/plugins/core/game/session.js';
import { TurnTimer } from '../../src/plugins/core/game/turn-timer.js';
import { dissolveRoom } from '../../src/ws/room-lifecycle.js';
import { makeGameState, makePlayer } from '../helpers/test-utils.js';

const TEST_SETTINGS = {
  turnTimeLimit: 30 as const,
  targetScore: 500 as const,
  houseRules: DEFAULT_HOUSE_RULES,
  allowSpectators: true,
  spectatorMode: 'hidden' as const,
};

interface TestRoomSocket {
  data: {
    user: { userId: string };
    roomCode: string | null;
    isSpectator: boolean;
  };
  leave: ReturnType<typeof vi.fn>;
}

function makeSocket(userId: string, roomCode: string, failLeave = false): TestRoomSocket {
  return {
    data: {
      user: { userId },
      roomCode,
      isSpectator: false,
    },
    leave: vi.fn(() => {
      if (failLeave) throw new Error(`adapter leave failed for ${userId}`);
    }),
  };
}

function makeIo(roomCode: string, sockets: TestRoomSocket[]) {
  const emitted: Array<{ target: string; event: string; payload: unknown }> = [];
  const fetchAllSockets = vi.fn(async () => []);
  const io = {
    in(target: string) {
      return {
        fetchSockets: async () => (target === roomCode ? sockets : []),
      };
    },
    to(target: string) {
      return {
        emit(event: string, payload?: unknown) {
          emitted.push({ target, event, payload });
        },
      };
    },
    fetchSockets: fetchAllSockets,
  } as unknown as SocketIOServer;
  return { io, emitted, fetchAllSockets };
}

class FailingRoomDeleteKv extends MemoryKvStore {
  override async del(...keys: string[]): Promise<void> {
    if (keys.includes('room:COMMIT')) throw new Error('injected room delete failure');
    await super.del(...keys);
  }
}

class FailingMemberCleanupKv extends MemoryKvStore {
  override async compareAndDelete(key: string, expectedValue: string): Promise<boolean> {
    if (key === 'user:member-a:room') throw new Error('injected mapping cleanup failure');
    return super.compareAndDelete(key, expectedValue);
  }
}

class CommittedRoomDeleteResponseLossKv extends MemoryKvStore {
  responseLost = false;

  override async del(...keys: string[]): Promise<void> {
    if (!this.responseLost && keys.includes('room:LOST')) {
      await super.del(...keys);
      this.responseLost = true;
      throw new Error('injected committed room delete response loss');
    }
    await super.del(...keys);
  }
}

function makeSession(): GameSession {
  return GameSession.fromState(
    makeGameState({
      players: [makePlayer('member-a'), makePlayer('member-b')],
    }),
  );
}

function makeVoiceChannels() {
  return {
    deleteRoomChannel: vi.fn(async (_roomCode: string) => undefined),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('dissolveRoom durable commit boundary', () => {
  it('continues teardown when multi-key deletion committed but its response was lost', async () => {
    vi.useFakeTimers();
    const kv = new CommittedRoomDeleteResponseLossKv();
    const roomCode = 'LOST';
    const session = makeSession();
    const sessions = new Map([[roomCode, session]]);
    const timer = new TurnTimer();
    timer.start(roomCode, 60, () => undefined);
    const persister = new GameStatePersister(kv);
    const revive = vi.spyOn(persister, 'revive');
    persister.markDirty(roomCode, session.getFullState());
    await persister.flushNow(roomCode);
    await createRoom(kv, roomCode, 'member-a', TEST_SETTINGS);
    await kv.set(`room:${roomCode}:seats`, JSON.stringify(Array.from({ length: 10 }, () => null)));
    await kv.set(`room:${roomCode}:spectators`, JSON.stringify([]));
    await kv.set(`room:${roomCode}:departed`, JSON.stringify(['member-b']));
    await setUserRoom(kv, 'member-a', roomCode);
    const socket = makeSocket('member-a', roomCode);
    const { io, emitted } = makeIo(roomCode, [socket]);
    const runtimeCleanup = vi.fn();
    const voiceChannels = makeVoiceChannels();

    await expect(
      dissolveRoom(io, kv, roomCode, sessions, timer, persister, 'host_closed', voiceChannels, runtimeCleanup),
    ).resolves.toBeUndefined();

    expect(kv.responseLost).toBe(true);
    await expect(Promise.all(getRoomStorageKeys(roomCode).map(key => kv.keys(key)))).resolves.toEqual([
      [],
      [],
      [],
      [],
      [],
    ]);
    expect(revive).not.toHaveBeenCalled();
    expect(sessions.has(roomCode)).toBe(false);
    expect(timer.isRunning(roomCode)).toBe(false);
    expect(runtimeCleanup).toHaveBeenCalledWith(roomCode);
    expect(voiceChannels.deleteRoomChannel).toHaveBeenCalledWith(roomCode);
    expect(socket.leave).toHaveBeenCalledWith(roomCode);
    for (const userId of ['member-a', 'member-b']) {
      expect(emitted).toContainEqual({
        target: `user:${userId}`,
        event: 'room:membership_ended',
        payload: { roomCode, reason: 'host_closed' },
      });
    }

    await kv.disconnect();
  });

  it('keeps runtime usable and republishes the session when durable deletion fails', async () => {
    vi.useFakeTimers();
    const kv = new FailingRoomDeleteKv();
    const roomCode = 'COMMIT';
    const session = makeSession();
    const sessions = new Map([[roomCode, session]]);
    const timer = new TurnTimer();
    timer.start(roomCode, 60, () => undefined);
    const persister = new GameStatePersister(kv);
    persister.markDirty(roomCode, session.getFullState());
    await createRoom(kv, roomCode, 'member-a', TEST_SETTINGS);
    await setUserRoom(kv, 'member-a', roomCode);
    const socket = makeSocket('member-a', roomCode);
    const { io, emitted } = makeIo(roomCode, [socket]);
    const runtimeCleanup = vi.fn();
    const voiceChannels = makeVoiceChannels();

    await expect(
      dissolveRoom(io, kv, roomCode, sessions, timer, persister, 'host_closed', voiceChannels, runtimeCleanup),
    ).rejects.toThrow('injected room delete failure');

    expect(await getRoom(kv, roomCode)).not.toBeNull();
    expect(sessions.get(roomCode)).toBe(session);
    expect(timer.isRunning(roomCode)).toBe(true);
    expect(runtimeCleanup).not.toHaveBeenCalled();
    expect(voiceChannels.deleteRoomChannel).not.toHaveBeenCalled();
    expect(socket.leave).not.toHaveBeenCalled();
    expect(socket.data.roomCode).toBe(roomCode);
    expect(await getUserRoom(kv, 'member-a')).toBe(roomCode);
    expect(await loadGameState(kv, roomCode)).toEqual(session.getFullState());
    expect(emitted.some(item => item.event === 'room:membership_ended')).toBe(false);

    timer.stop(roomCode);
    await kv.disconnect();
  });

  it('continues every independent cleanup after mapping and adapter failures', async () => {
    vi.useFakeTimers();
    const kv = new FailingMemberCleanupKv();
    const roomCode = 'POSTOK';
    const session = makeSession();
    const sessions = new Map([[roomCode, session]]);
    const timer = new TurnTimer();
    timer.start(roomCode, 60, () => undefined);
    const persister = new GameStatePersister(kv);
    await createRoom(kv, roomCode, 'member-a', TEST_SETTINGS);
    await setUserRoom(kv, 'member-a', roomCode);
    await setUserRoom(kv, 'member-b', roomCode);
    const socketA = makeSocket('member-a', roomCode, true);
    const socketB = makeSocket('member-b', roomCode);
    const { io, emitted, fetchAllSockets } = makeIo(roomCode, [socketA, socketB]);
    const runtimeCleanup = vi.fn();
    const voiceChannels = makeVoiceChannels();

    await expect(
      dissolveRoom(io, kv, roomCode, sessions, timer, persister, 'empty', voiceChannels, runtimeCleanup),
    ).resolves.toBeUndefined();

    expect(await getRoom(kv, roomCode)).toBeNull();
    expect(sessions.has(roomCode)).toBe(false);
    expect(timer.isRunning(roomCode)).toBe(false);
    expect(runtimeCleanup).toHaveBeenCalledWith(roomCode);
    expect(voiceChannels.deleteRoomChannel).toHaveBeenCalledWith(roomCode);
    expect(socketA.leave).toHaveBeenCalledWith(roomCode);
    expect(socketB.leave).toHaveBeenCalledWith(roomCode);
    expect(socketB.data.roomCode).toBeNull();
    expect(await getUserRoom(kv, 'member-a')).toBe(roomCode);
    expect(await getUserRoom(kv, 'member-b')).toBeNull();
    expect(emitted).toContainEqual({
      target: 'user:member-b',
      event: 'room:membership_ended',
      payload: { roomCode, reason: 'empty' },
    });
    expect(emitted).toContainEqual({
      target: 'user:member-a',
      event: 'room:membership_ended',
      payload: { roomCode, reason: 'empty' },
    });
    expect(fetchAllSockets).toHaveBeenCalled();

    await kv.disconnect();
  });
});

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import { MemoryKvStore } from '../../src/kv/memory';
import { RoomManager } from '../../src/plugins/core/room/manager';
import {
  getRoom,
  getRoomSeats,
  getRoomSpectators,
  createRoom,
  deleteRoom,
  setRoomStatus,
  setRoomSeats,
  setUserRoom,
  takeSeat,
} from '../../src/plugins/core/room/store';
import { markMemberDeparted } from '../../src/ws/room-departure';
import { setupSocketHandlers } from '../../src/ws/socket-handler';
import type { MumbleIceConfig } from '../../src/config';
import { makeFakeIo } from '../helpers/fake-io';
import { saveGameState } from '../../src/plugins/core/game/state-store';
import { makeGameState, makePlayer } from '../helpers/test-utils';

const kv = new MemoryKvStore();
const fake = makeFakeIo();
const mumbleIce: MumbleIceConfig = {
  enabled: false,
  host: '',
  port: 0,
  serverId: 1,
  parentChannelId: 0,
  channelNamePrefix: 'test',
};

let handlers: ReturnType<typeof setupSocketHandlers> | undefined;

afterAll(async () => {
  handlers?.turnTimer.stopAll();
  await kv.disconnect();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function seedDepartedRoom(suffix: string, status: 'waiting' | 'playing'): Promise<string> {
  const manager = new RoomManager(kv);
  const firstId = `startup_${suffix}_first`;
  const secondId = `startup_${suffix}_second`;
  const roomCode = await manager.createRoom(
    firstId,
    'First',
    {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    },
    null,
    'normal',
  );
  await takeSeat(kv, roomCode, 1, {
    userId: secondId,
    nickname: 'Second',
    avatarUrl: null,
    role: 'normal',
    ready: false,
    connected: false,
    isBot: false,
  });
  await Promise.all([
    setUserRoom(kv, firstId, roomCode),
    setUserRoom(kv, secondId, roomCode),
    setRoomStatus(kv, roomCode, status),
  ]);
  await markMemberDeparted(kv, roomCode, firstId);
  await markMemberDeparted(kv, roomCode, secondId);
  return roomCode;
}

describe('startup explicit-departure reconciliation', () => {
  it('immediately dissolves waiting and active rooms whose humans had all explicitly left', async () => {
    const waitingCode = await seedDepartedRoom('waiting', 'waiting');
    const activeCode = await seedDepartedRoom('active', 'playing');

    handlers = setupSocketHandlers(fake.io, kv, 'test-secret', 60_000, mumbleIce);

    for (let attempt = 0; attempt < 20; attempt++) {
      if (!(await getRoom(kv, waitingCode)) && !(await getRoom(kv, activeCode))) break;
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    expect(await getRoom(kv, waitingCode)).toBeNull();
    expect(await getRoom(kv, activeCode)).toBeNull();
  });

  it('restores an empty active roster from its current snapshot before deciding the room is empty', async () => {
    const localKv = new MemoryKvStore();
    const localFake = makeFakeIo();
    const manager = new RoomManager(localKv);
    const roomCode = await manager.createRoom(
      'startup_roster_owner',
      'RosterOwner',
      {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: DEFAULT_HOUSE_RULES,
        allowSpectators: true,
        spectatorMode: 'hidden',
      },
      null,
      'normal',
    );
    const snapshot = makeGameState({
      phase: 'playing',
      players: [
        { ...makePlayer('startup_roster_owner'), name: 'RosterOwner' },
        { ...makePlayer('startup_roster_other'), name: 'RosterOther' },
      ],
    });
    await Promise.all([
      setRoomStatus(localKv, roomCode, 'playing'),
      setUserRoom(localKv, 'startup_roster_owner', roomCode),
      setUserRoom(localKv, 'startup_roster_other', roomCode),
      saveGameState(localKv, roomCode, snapshot),
      setRoomSeats(
        localKv,
        roomCode,
        Array.from({ length: 10 }, () => null),
      ),
    ]);

    const localHandlers = setupSocketHandlers(localFake.io, localKv, 'test-secret', 60_000, mumbleIce);
    for (let attempt = 0; attempt < 20; attempt++) {
      const seats = await getRoomSeats(localKv, roomCode);
      if (seats.filter(Boolean).length === 2) break;
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    expect(await getRoom(localKv, roomCode)).not.toBeNull();
    const seats = await getRoomSeats(localKv, roomCode);
    expect(seats.filter(seat => seat?.userId === 'startup_roster_owner')).toHaveLength(1);
    expect(seats.filter(seat => seat?.userId === 'startup_roster_other')).toHaveLength(1);
    expect(seats.filter(Boolean).every(seat => seat?.connected === false)).toBe(true);
    expect(await getRoomSpectators(localKv, roomCode)).toEqual([]);

    localHandlers.turnTimer.stopAll();
    await localKv.disconnect();
  });

  it('does not overwrite a player who rejoins before startup reconciliation reaches the room', async () => {
    const localKv = new BlockingRoomKeysStore();
    const localFake = makeFakeIo();
    const manager = new RoomManager(localKv);
    const roomCode = await manager.createRoom(
      'startup_live_owner',
      'LiveOwner',
      {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: DEFAULT_HOUSE_RULES,
        allowSpectators: true,
        spectatorMode: 'hidden',
      },
      null,
      'normal',
    );
    const snapshot = makeGameState({
      phase: 'playing',
      players: [
        { ...makePlayer('startup_live_owner'), name: 'LiveOwner', connected: true },
        { ...makePlayer('startup_live_other'), name: 'LiveOther', connected: true },
      ],
    });
    await takeSeat(localKv, roomCode, 1, {
      userId: 'startup_live_other',
      nickname: 'LiveOther',
      avatarUrl: null,
      role: 'normal',
      ready: false,
      connected: true,
      isBot: false,
    });
    await Promise.all([
      setRoomStatus(localKv, roomCode, 'playing'),
      setUserRoom(localKv, 'startup_live_owner', roomCode),
      setUserRoom(localKv, 'startup_live_other', roomCode),
      saveGameState(localKv, roomCode, snapshot),
    ]);

    const localHandlers = setupSocketHandlers(localFake.io, localKv, 'test-secret', 60_000, mumbleIce);
    const owner = await localFake.connect('startup_live_owner', 'LiveOwner');
    expect((await owner.call('room:rejoin', roomCode)).success).toBe(true);
    localKv.releaseRoomKeys();

    for (let attempt = 0; attempt < 20; attempt++) {
      const ownerSeat = (await getRoomSeats(localKv, roomCode)).find(seat => seat?.userId === 'startup_live_owner');
      if (ownerSeat?.connected) break;
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    expect((await getRoomSeats(localKv, roomCode)).find(seat => seat?.userId === 'startup_live_owner')).toMatchObject({
      connected: true,
    });

    localHandlers.turnTimer.stopAll();
    await localKv.disconnect();
  });

  it('isolates a transient room failure, reconciles later rooms, and retries the failed room', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T00:00:00.000Z'));
    const localKv = new OneRoomStartupFaultStore();
    const localFake = makeFakeIo();
    await seedTornActiveRoom(localKv, 'START1', 'start_one_owner', 'start_one_other');
    await seedTornActiveRoom(localKv, 'START2', 'start_two_owner', 'start_two_other');
    localKv.failRoomCode = 'START1';

    const localHandlers = setupSocketHandlers(localFake.io, localKv, 'test-secret', 60 * 60_000, mumbleIce);
    await flushAsyncWork();

    expect((await getRoomSeats(localKv, 'START1')).filter(Boolean)).toHaveLength(0);
    expect((await getRoomSeats(localKv, 'START2')).filter(Boolean)).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1_000);
    expect((await getRoomSeats(localKv, 'START1')).filter(Boolean)).toHaveLength(2);

    // START2 armed its all-disconnect timer during the first pass. START1
    // only arms after its delayed retry, so their deadlines remain distinct.
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1_000);
    expect(await getRoom(localKv, 'START2')).toBeNull();
    expect(await getRoom(localKv, 'START1')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await getRoom(localKv, 'START1')).toBeNull();

    localHandlers.turnTimer.stopAll();
    await localKv.disconnect();
  });

  it('retries a transient startup room-list failure instead of skipping reconciliation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T00:00:00.000Z'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const localKv = new RoomListStartupFaultStore();
    const localFake = makeFakeIo();
    await seedTornActiveRoom(localKv, 'LIST01', 'list_owner', 'list_other');
    localKv.failNextRoomList = true;

    const localHandlers = setupSocketHandlers(localFake.io, localKv, 'test-secret', 60 * 60_000, mumbleIce);
    await flushAsyncWork();

    expect(localKv.roomListAttempts).toBe(1);
    expect((await getRoomSeats(localKv, 'LIST01')).filter(Boolean)).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000);
    await flushAsyncWork();
    expect(localKv.roomListAttempts).toBe(2);
    expect((await getRoomSeats(localKv, 'LIST01')).filter(Boolean)).toHaveLength(2);

    localHandlers.turnTimer.stopAll();
    await localKv.disconnect();
  });

  it('does not apply an old startup retry to a room recreated under the same code', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T00:00:00.000Z'));
    const localKv = new OneRoomStartupFaultStore();
    const localFake = makeFakeIo();
    await seedTornActiveRoom(localKv, 'REUSED1', 'old_owner', 'old_other');
    localKv.failRoomCode = 'REUSED1';

    const localHandlers = setupSocketHandlers(localFake.io, localKv, 'test-secret', 60 * 60_000, mumbleIce);
    await flushAsyncWork();
    expect((await getRoomSeats(localKv, 'REUSED1')).filter(Boolean)).toHaveLength(0);

    await deleteRoom(localKv, 'REUSED1');
    await vi.advanceTimersByTimeAsync(1);
    await createRoom(localKv, 'REUSED1', 'new_owner', {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    });
    await takeSeat(localKv, 'REUSED1', 0, {
      userId: 'new_owner',
      nickname: 'NewOwner',
      avatarUrl: null,
      role: 'normal',
      ready: true,
      connected: true,
      isBot: false,
    });
    await setUserRoom(localKv, 'new_owner', 'REUSED1');

    await vi.advanceTimersByTimeAsync(999);
    expect(await getRoom(localKv, 'REUSED1')).toMatchObject({ ownerId: 'new_owner' });
    expect((await getRoomSeats(localKv, 'REUSED1')).find(seat => seat?.userId === 'new_owner')).toMatchObject({
      connected: true,
      ready: true,
    });

    localHandlers.turnTimer.stopAll();
    await localKv.disconnect();
  });

  it.each([
    ['malformed JSON', '{'],
    [
      'a current state missing players',
      JSON.stringify({
        gameState: { phase: 'playing' },
        lifecycle: { excludedFromNextRound: [], pendingSpectatorJoins: [] },
      }),
    ],
  ])('dissolves a startup room whose snapshot contains %s', async (_label, rawSnapshot) => {
    const localKv = new MemoryKvStore();
    const localFake = makeFakeIo();
    await createRoom(localKv, 'CORRUPT1', 'corrupt_owner', {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    });
    await takeSeat(localKv, 'CORRUPT1', 0, {
      userId: 'corrupt_owner',
      nickname: 'CorruptOwner',
      avatarUrl: null,
      role: 'normal',
      ready: false,
      connected: true,
      isBot: false,
    });
    await Promise.all([
      setRoomStatus(localKv, 'CORRUPT1', 'playing'),
      setUserRoom(localKv, 'corrupt_owner', 'CORRUPT1'),
      localKv.set('game:CORRUPT1:state', rawSnapshot),
    ]);

    const localHandlers = setupSocketHandlers(localFake.io, localKv, 'test-secret', 60_000, mumbleIce);
    for (let attempt = 0; attempt < 20 && (await getRoom(localKv, 'CORRUPT1')); attempt++) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    expect(await getRoom(localKv, 'CORRUPT1')).toBeNull();
    expect(await localKv.get('game:CORRUPT1:state')).toBeNull();
    localHandlers.turnTimer.stopAll();
    await localKv.disconnect();
  });
});

class BlockingRoomKeysStore extends MemoryKvStore {
  private roomKeysBlocked = true;
  private release!: () => void;
  private gate = new Promise<void>(resolve => {
    this.release = resolve;
  });

  releaseRoomKeys(): void {
    this.roomKeysBlocked = false;
    this.release();
  }

  override async keys(pattern: string): Promise<string[]> {
    if (pattern === 'room:*' && this.roomKeysBlocked) await this.gate;
    return super.keys(pattern);
  }
}

class OneRoomStartupFaultStore extends MemoryKvStore {
  failRoomCode: string | null = null;
  private faultInjected = false;

  override async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.faultInjected && this.failRoomCode && key === `room:${this.failRoomCode}`) {
      this.faultInjected = true;
      throw new Error('injected startup room identity read failure');
    }
    return super.hgetall(key);
  }
}

class RoomListStartupFaultStore extends MemoryKvStore {
  failNextRoomList = false;
  roomListAttempts = 0;

  override async keys(pattern: string): Promise<string[]> {
    if (pattern === 'room:*') {
      this.roomListAttempts += 1;
      if (this.failNextRoomList) {
        this.failNextRoomList = false;
        throw new Error('injected startup room-list failure');
      }
    }
    return super.keys(pattern);
  }
}

async function seedTornActiveRoom(
  store: MemoryKvStore,
  roomCode: string,
  ownerId: string,
  otherId: string,
): Promise<void> {
  await createRoom(store, roomCode, ownerId, {
    turnTimeLimit: 30,
    targetScore: 500,
    houseRules: DEFAULT_HOUSE_RULES,
    allowSpectators: true,
    spectatorMode: 'hidden',
  });
  await Promise.all([
    setRoomStatus(store, roomCode, 'playing'),
    setUserRoom(store, ownerId, roomCode),
    setUserRoom(store, otherId, roomCode),
    saveGameState(
      store,
      roomCode,
      makeGameState({
        phase: 'playing',
        players: [
          { ...makePlayer(ownerId), name: ownerId, connected: true },
          { ...makePlayer(otherId), name: otherId, connected: true },
        ],
      }),
    ),
    setRoomSeats(
      store,
      roomCode,
      Array.from({ length: 10 }, () => null),
    ),
  ]);
}

async function flushAsyncWork(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) await Promise.resolve();
}

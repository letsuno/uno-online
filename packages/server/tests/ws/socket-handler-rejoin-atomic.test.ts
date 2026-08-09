import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import type { MumbleIceConfig } from '../../src/config';
import { setupSocketHandlers } from '../../src/ws/socket-handler';
import { getRoom, getRoomSeats, getRoomSpectators, getUserRoom, setRoomOwner } from '../../src/plugins/core/room/store';
import { loadGameState } from '../../src/plugins/core/game/state-store';
import { getDepartedMemberIds, markMemberDeparted } from '../../src/ws/room-departure';
import { cancelOwnerTransfer } from '../../src/ws/owner-transfer';
import { makeFakeIo, type FakeSocket } from '../helpers/fake-io';

const mumbleIce: MumbleIceConfig = {
  enabled: false,
  host: '',
  port: 0,
  serverId: 1,
  parentChannelId: 0,
  channelNamePrefix: 'test',
};

const activeHandlers: Array<ReturnType<typeof setupSocketHandlers>> = [];
const activeStores: MemoryKvStore[] = [];

afterEach(async () => {
  for (const handlers of activeHandlers.splice(0)) handlers.turnTimer.stopAll();
  for (const store of activeStores.splice(0)) await store.disconnect();
  vi.useRealTimers();
});

function makeHarness() {
  const kv = new MemoryKvStore();
  const fake = makeFakeIo();
  const handlers = setupSocketHandlers(fake.io, kv, 'test-secret', 60 * 60_000, mumbleIce);
  activeHandlers.push(handlers);
  activeStores.push(kv);
  return { kv, fake, handlers };
}

async function startGame(owner: FakeSocket, second: FakeSocket, spectator?: FakeSocket): Promise<string> {
  const created = await owner.call('room:create', {});
  expect(created.success).toBe(true);
  const roomCode = created.roomCode as string;
  expect((await second.call('room:join', roomCode)).success).toBe(true);
  expect((await second.call('seat:take', 1)).success).toBe(true);
  if (spectator) expect((await spectator.call('room:join', roomCode)).success).toBe(true);
  expect((await second.call('room:ready', true)).success).toBe(true);
  expect((await owner.call('room:ready', true)).success).toBe(true);
  expect((await owner.call('game:start')).success).toBe(true);
  return roomCode;
}

describe('atomic active-room rejoin', () => {
  it.each(['roster', 'snapshot'] as const)(
    'rolls back player session, roster and socket membership when the %s commit fails',
    async fault => {
      const { kv, fake, handlers } = makeHarness();
      const owner = await fake.connect('rejoin_tx_owner', 'Owner');
      const player = await fake.connect('rejoin_tx_player', 'Player');
      const roomCode = await startGame(owner, player);
      await player.trigger('disconnect');

      const replacement = await fake.connect('rejoin_tx_player', 'Player');
      const originalSet = kv.set.bind(kv);
      const originalBatchStrings = kv.batchStrings.bind(kv);
      let failSnapshotOnce = true;
      let failRosterOnce = true;
      kv.set = async (key, value, ttlSeconds) => {
        if (fault === 'snapshot' && failSnapshotOnce && key === `game:${roomCode}:state`) {
          failSnapshotOnce = false;
          throw new Error('injected snapshot failure');
        }
        return originalSet(key, value, ttlSeconds);
      };
      kv.batchStrings = async operations => {
        if (
          fault === 'roster' &&
          failRosterOnce &&
          operations.some(operation => operation.key === `room:${roomCode}:seats`)
        ) {
          failRosterOnce = false;
          throw new Error('injected roster failure');
        }
        return originalBatchStrings(operations);
      };

      const failed = await replacement.call('room:rejoin', roomCode);
      expect(failed).toMatchObject({ success: false });
      expect(replacement.data.roomCode).toBeNull();
      expect(replacement.rooms.has(roomCode)).toBe(false);
      expect(await getUserRoom(kv, 'rejoin_tx_player')).toBe(roomCode);
      expect((await getRoomSeats(kv, roomCode)).find(seat => seat?.userId === 'rejoin_tx_player')).toMatchObject({
        connected: false,
      });
      expect(
        handlers.sessions
          .get(roomCode)!
          .getFullState()
          .players.find(playerState => playerState.id === 'rejoin_tx_player'),
      ).toMatchObject({ connected: false });
      expect(
        (await loadGameState(kv, roomCode))!.players.find(playerState => playerState.id === 'rejoin_tx_player'),
      ).toMatchObject({ connected: false });

      kv.set = originalSet;
      kv.batchStrings = originalBatchStrings;
      expect(await replacement.call('room:rejoin', roomCode)).toMatchObject({ success: true });
      expect(replacement.data.roomCode).toBe(roomCode);
      expect(replacement.rooms.has(roomCode)).toBe(true);
      expect((await getRoomSeats(kv, roomCode)).find(seat => seat?.userId === 'rejoin_tx_player')).toMatchObject({
        connected: true,
      });
    },
  );

  it('removes an outsider spectator roster/mapping when its adapter join fails, then permits retry', async () => {
    const { kv, fake } = makeHarness();
    const owner = await fake.connect('rejoin_out_owner', 'Owner');
    const player = await fake.connect('rejoin_out_player', 'Player');
    const roomCode = await startGame(owner, player);
    const watcher = await fake.connect('rejoin_out_watcher', 'Watcher');

    const originalJoin = watcher.join.bind(watcher);
    let failAdapterOnce = true;
    watcher.join = (target: string) => {
      if (failAdapterOnce && target === roomCode) {
        failAdapterOnce = false;
        throw new Error('injected adapter failure');
      }
      return originalJoin(target);
    };

    expect(await watcher.call('room:rejoin', roomCode)).toMatchObject({ success: false });
    expect(watcher.data.roomCode).toBeNull();
    expect(watcher.rooms.has(roomCode)).toBe(false);
    expect(await getUserRoom(kv, 'rejoin_out_watcher')).toBeNull();
    expect((await getRoomSpectators(kv, roomCode)).some(spectator => spectator.userId === 'rejoin_out_watcher')).toBe(
      false,
    );

    expect(await watcher.call('room:rejoin', roomCode)).toMatchObject({
      success: true,
      mode: 'spectator',
    });
    expect(await getUserRoom(kv, 'rejoin_out_watcher')).toBe(roomCode);
    expect(watcher.rooms.has(roomCode)).toBe(true);
  });

  it('restores an existing spectator as disconnected when its adapter rejoin fails', async () => {
    const { kv, fake } = makeHarness();
    const owner = await fake.connect('rejoin_spec_owner', 'Owner');
    const player = await fake.connect('rejoin_spec_player', 'Player');
    const spectator = await fake.connect('rejoin_spec_member', 'MemberWatcher');
    const roomCode = await startGame(owner, player, spectator);
    await spectator.trigger('disconnect');
    await markMemberDeparted(kv, roomCode, 'rejoin_spec_member');

    const replacement = await fake.connect('rejoin_spec_member', 'MemberWatcher');
    const originalJoin = replacement.join.bind(replacement);
    let failAdapterOnce = true;
    replacement.join = (target: string) => {
      if (failAdapterOnce && target === roomCode) {
        failAdapterOnce = false;
        throw new Error('injected adapter failure');
      }
      return originalJoin(target);
    };

    expect(await replacement.call('room:rejoin', roomCode)).toMatchObject({ success: false });
    expect(await getUserRoom(kv, 'rejoin_spec_member')).toBe(roomCode);
    expect((await getRoomSpectators(kv, roomCode)).find(item => item.userId === 'rejoin_spec_member')).toMatchObject({
      connected: false,
    });
    expect(await getDepartedMemberIds(kv, roomCode)).toContain('rejoin_spec_member');
    expect(replacement.data.roomCode).toBeNull();
    expect(replacement.rooms.has(roomCode)).toBe(false);

    expect(await replacement.call('room:rejoin', roomCode)).toMatchObject({
      success: true,
      mode: 'spectator',
    });
    expect((await getRoomSpectators(kv, roomCode)).find(item => item.userId === 'rejoin_spec_member')).toMatchObject({
      connected: true,
    });
    expect(await getDepartedMemberIds(kv, roomCode)).not.toContain('rejoin_spec_member');
  });
});

describe('atomic active-room leave', () => {
  it('keeps a fully committed suspension and retries its snapshot after an immediate write failure', async () => {
    vi.useFakeTimers();
    const { kv, fake, handlers } = makeHarness();
    const owner = await fake.connect('leave_snapshot_owner', 'Owner');
    const player = await fake.connect('leave_snapshot_player', 'Player');
    const roomCode = await startGame(owner, player);
    const originalSet = kv.set.bind(kv);
    let failSnapshotOnce = true;
    kv.set = async (key, value, ttlSeconds) => {
      if (failSnapshotOnce && key === `game:${roomCode}:state`) {
        failSnapshotOnce = false;
        throw new Error('injected leave snapshot failure');
      }
      return originalSet(key, value, ttlSeconds);
    };

    await expect(player.call('room:leave')).resolves.toMatchObject({
      success: true,
      outcome: 'suspended',
    });
    expect(
      handlers.sessions
        .get(roomCode)!
        .getFullState()
        .players.find(state => state.id === 'leave_snapshot_player'),
    ).toMatchObject({ connected: false, autopilot: true });
    expect((await getRoomSeats(kv, roomCode)).find(seat => seat?.userId === 'leave_snapshot_player')).toMatchObject({
      connected: false,
    });
    expect(await getDepartedMemberIds(kv, roomCode)).toContain('leave_snapshot_player');

    await vi.advanceTimersByTimeAsync(1_050);
    expect(
      (await loadGameState(kv, roomCode))!.players.find(state => state.id === 'leave_snapshot_player'),
    ).toMatchObject({ connected: false, autopilot: true });
    kv.set = originalSet;
  });

  it('arms the all-disconnect grace when post-leave live-member refresh fails', async () => {
    vi.useFakeTimers();
    const { kv, fake, handlers } = makeHarness();
    const owner = await fake.connect('leave_live_fault_owner', 'Owner');
    const player = await fake.connect('leave_live_fault_player', 'Player');
    const roomCode = await startGame(owner, player);

    // The first disconnect still observes the other player as live and does
    // not start the room-level grace window.
    await owner.trigger('disconnect');

    const originalIn = fake.io.in.bind(fake.io);
    let roomFetches = 0;
    let failedRefresh = false;
    vi.spyOn(fake.io, 'in').mockImplementation(((target: string) => {
      const view = originalIn(target);
      if (target !== roomCode) return view;
      return {
        ...view,
        fetchSockets: async () => {
          roomFetches += 1;
          // emitGameUpdate performs the first fetch. The second one is the
          // authoritative live-human refresh after the socket is detached.
          if (!failedRefresh && roomFetches === 2) {
            failedRefresh = true;
            throw new Error('injected explicit-leave live refresh failure');
          }
          return view.fetchSockets();
        },
      };
    }) as typeof fake.io.in);

    await expect(player.call('room:leave')).resolves.toMatchObject({
      success: true,
      outcome: 'suspended',
    });
    expect(failedRefresh).toBe(true);
    handlers.turnTimer.stop(roomCode);

    await vi.advanceTimersByTimeAsync(5 * 60_000 + 100);
    expect(await getRoom(kv, roomCode)).toBeNull();
  });
});

describe('waiting-room eviction governance', () => {
  it('starts the five-minute grace after evicting the last live seat beside a departed spectator', async () => {
    vi.useFakeTimers();
    const { kv, fake } = makeHarness();
    const owner = await fake.connect('evict_zombie_owner', 'Owner');
    const spectator = await fake.connect('evict_zombie_spec', 'DepartedWatcher');
    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;
    expect((await spectator.call('room:join', roomCode)).success).toBe(true);

    await markMemberDeparted(kv, roomCode, 'evict_zombie_spec');
    await spectator.trigger('disconnect');
    await owner.trigger('disconnect');
    // Isolate the post-eviction path: owner-transfer governance can also arm
    // the same grace at its earlier ten-second deadline.
    cancelOwnerTransfer(roomCode);

    await vi.advanceTimersByTimeAsync(31_000);
    expect(await getRoom(kv, roomCode)).not.toBeNull();
    expect((await getRoomSeats(kv, roomCode)).some(seat => seat?.userId === 'evict_zombie_owner')).toBe(false);
    expect((await getRoomSpectators(kv, roomCode)).find(item => item.userId === 'evict_zombie_spec')).toMatchObject({
      connected: false,
    });

    await vi.advanceTimersByTimeAsync(298_000);
    expect(await getRoom(kv, roomCode)).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await getRoom(kv, roomCode)).toBeNull();
  });

  it.each(['roster read', 'membership removal'] as const)(
    'retries the expired eviction after a transient %s failure',
    async fault => {
      vi.useFakeTimers();
      const { kv, fake } = makeHarness();
      const suffix = fault === 'roster read' ? 'read' : 'remove';
      const ownerId = `evict_retry_owner_${suffix}`;
      const memberId = `evict_retry_member_${suffix}`;
      const owner = await fake.connect(ownerId, 'Owner');
      const member = await fake.connect(memberId, 'Member');
      const roomCode = (await owner.call('room:create', {})).roomCode as string;
      expect((await member.call('room:join', roomCode)).success).toBe(true);
      expect((await member.call('seat:take', 1)).success).toBe(true);

      await member.trigger('disconnect');
      const originalGet = kv.get.bind(kv);
      const originalBatch = kv.batchStrings.bind(kv);
      let failedOnce = false;
      kv.get = async key => {
        if (fault === 'roster read' && !failedOnce && key === `room:${roomCode}:seats`) {
          failedOnce = true;
          throw new Error('injected expired eviction roster read failure');
        }
        return originalGet(key);
      };
      kv.batchStrings = async operations => {
        if (
          fault === 'membership removal' &&
          !failedOnce &&
          operations.some(operation => operation.type === 'del' && operation.key === `user:${memberId}:room`)
        ) {
          failedOnce = true;
          throw new Error('injected expired eviction membership removal failure');
        }
        return originalBatch(operations);
      };

      await vi.advanceTimersByTimeAsync(30_100);
      expect(failedOnce).toBe(true);
      expect((await getRoomSeats(kv, roomCode)).some(seat => seat?.userId === memberId)).toBe(true);
      expect(await getUserRoom(kv, memberId)).toBe(roomCode);

      await vi.advanceTimersByTimeAsync(1_100);
      expect((await getRoomSeats(kv, roomCode)).some(seat => seat?.userId === memberId)).toBe(false);
      expect(await getUserRoom(kv, memberId)).toBeNull();

      kv.get = originalGet;
      kv.batchStrings = originalBatch;
    },
  );

  it('keeps a member who rejoins while a failed eviction is waiting to retry', async () => {
    vi.useFakeTimers();
    const { kv, fake } = makeHarness();
    const owner = await fake.connect('evict_retry_rejoin_owner', 'Owner');
    const member = await fake.connect('evict_retry_rejoin_member', 'Member');
    const roomCode = (await owner.call('room:create', {})).roomCode as string;
    expect((await member.call('room:join', roomCode)).success).toBe(true);
    expect((await member.call('seat:take', 1)).success).toBe(true);
    await member.trigger('disconnect');

    const originalGet = kv.get.bind(kv);
    let failedOnce = false;
    kv.get = async key => {
      if (!failedOnce && key === `room:${roomCode}:seats`) {
        failedOnce = true;
        throw new Error('injected eviction read failure before rejoin');
      }
      return originalGet(key);
    };
    await vi.advanceTimersByTimeAsync(30_100);
    expect(failedOnce).toBe(true);

    const replacement = await fake.connect('evict_retry_rejoin_member', 'Member');
    expect(await replacement.call('room:rejoin', roomCode)).toMatchObject({ success: true });
    await vi.advanceTimersByTimeAsync(1_100);

    expect((await getRoomSeats(kv, roomCode)).find(seat => seat?.userId === 'evict_retry_rejoin_member')).toMatchObject(
      { connected: true },
    );
    expect(await getUserRoom(kv, 'evict_retry_rejoin_member')).toBe(roomCode);
    kv.get = originalGet;
  });
});

describe('disconnect governance survives projection and persistence faults', () => {
  it('does not count a departed socket whose adapter leave failed as live', async () => {
    vi.useFakeTimers();
    const { kv, fake } = makeHarness();
    const owner = await fake.connect('dc_stale_owner', 'Owner');
    const departed = await fake.connect('dc_stale_departed', 'Departed');
    const roomCode = await startGame(owner, departed);
    const originalLeave = departed.leave.bind(departed);
    departed.leave = (target: string) => {
      if (target === roomCode) throw new Error('injected adapter leave failure');
      originalLeave(target);
    };

    await expect(departed.call('room:leave')).resolves.toMatchObject({
      success: true,
      outcome: 'suspended',
    });
    expect(departed.rooms.has(roomCode)).toBe(true);
    expect(departed.data.roomCode).toBeNull();
    expect(await getDepartedMemberIds(kv, roomCode)).toContain('dc_stale_departed');

    await owner.trigger('disconnect');
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 100);
    expect(await getRoom(kv, roomCode)).toBeNull();
  });

  it('retries the five-minute room deletion after a transient durable delete failure', async () => {
    vi.useFakeTimers();
    const { kv, fake } = makeHarness();
    const owner = await fake.connect('dc_retry_owner', 'Owner');
    const player = await fake.connect('dc_retry_player', 'Player');
    const roomCode = await startGame(owner, player);
    const originalDel = kv.del.bind(kv);
    let failDeleteOnce = true;
    kv.del = async (...keys) => {
      if (failDeleteOnce && keys.includes(`room:${roomCode}`)) {
        failDeleteOnce = false;
        throw new Error('injected all-disconnect delete failure');
      }
      return originalDel(...keys);
    };

    await player.trigger('disconnect');
    await owner.trigger('disconnect');
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 100);
    expect(failDeleteOnce).toBe(false);
    expect(await getRoom(kv, roomCode)).not.toBeNull();

    await vi.advanceTimersByTimeAsync(1_100);
    expect(await getRoom(kv, roomCode)).toBeNull();
    kv.del = originalDel;
  });

  it('still transfers a disconnected spectator owner when lobby projection fails', async () => {
    vi.useFakeTimers();
    const { kv, fake } = makeHarness();
    const seated = await fake.connect('dc_spec_seated', 'Seated');
    const spectator = await fake.connect('dc_spec_owner', 'SpectatorOwner');
    const roomCode = (await seated.call('room:create', {})).roomCode as string;
    expect((await spectator.call('room:join', roomCode)).success).toBe(true);
    await setRoomOwner(kv, roomCode, 'dc_spec_owner');

    const originalKeys = kv.keys.bind(kv);
    let failLobbyOnce = true;
    kv.keys = async pattern => {
      if (failLobbyOnce && pattern === 'room:*') {
        failLobbyOnce = false;
        throw new Error('injected lobby projection failure');
      }
      return originalKeys(pattern);
    };

    await spectator.trigger('disconnect');
    expect(failLobbyOnce).toBe(false);
    kv.keys = originalKeys;
    await vi.advanceTimersByTimeAsync(10_100);
    expect((await getRoom(kv, roomCode))?.ownerId).toBe('dc_spec_seated');
  });

  it('still arms active-player governance when the immediate snapshot flush fails', async () => {
    vi.useFakeTimers();
    const { kv, fake, handlers } = makeHarness();
    const owner = await fake.connect('dc_player_owner', 'Owner');
    const player = await fake.connect('dc_player_target', 'Target');
    const roomCode = await startGame(owner, player);
    const originalSet = kv.set.bind(kv);
    let failSnapshotOnce = true;
    kv.set = async (key, value, ttlSeconds) => {
      if (failSnapshotOnce && key === `game:${roomCode}:state`) {
        failSnapshotOnce = false;
        throw new Error('injected disconnect snapshot failure');
      }
      return originalSet(key, value, ttlSeconds);
    };

    await player.trigger('disconnect');
    expect(failSnapshotOnce).toBe(false);
    expect(
      handlers.sessions
        .get(roomCode)!
        .getFullState()
        .players.find(state => state.id === 'dc_player_target'),
    ).toMatchObject({ connected: false, autopilot: false });

    await vi.advanceTimersByTimeAsync(60_100);
    expect(
      handlers.sessions
        .get(roomCode)!
        .getFullState()
        .players.find(state => state.id === 'dc_player_target'),
    ).toMatchObject({ connected: false, autopilot: true });
    kv.set = originalSet;
  });

  it('still evicts a waiting seat when the post-commit roster projection read fails', async () => {
    vi.useFakeTimers();
    const { kv, fake } = makeHarness();
    const owner = await fake.connect('dc_wait_owner', 'Owner');
    const member = await fake.connect('dc_wait_member', 'Member');
    const roomCode = (await owner.call('room:create', {})).roomCode as string;
    expect((await member.call('room:join', roomCode)).success).toBe(true);
    expect((await member.call('seat:take', 1)).success).toBe(true);

    const originalGet = kv.get.bind(kv);
    let seatReads = 0;
    let injected = false;
    kv.get = async key => {
      if (key === `room:${roomCode}:seats` && ++seatReads === 2) {
        injected = true;
        throw new Error('injected waiting projection read failure');
      }
      return originalGet(key);
    };

    await member.trigger('disconnect');
    expect(injected).toBe(true);
    await vi.advanceTimersByTimeAsync(31_000);
    expect((await getRoomSeats(kv, roomCode)).some(seat => seat?.userId === 'dc_wait_member')).toBe(false);
    expect(await getUserRoom(kv, 'dc_wait_member')).toBeNull();
    kv.get = originalGet;
  });
});

describe('committed player controls survive projection faults', () => {
  it('acknowledges the committed autopilot value when game-update projection fails', async () => {
    const { fake, handlers } = makeHarness();
    const owner = await fake.connect('toggle_projection_owner', 'Owner');
    const player = await fake.connect('toggle_projection_player', 'Player');
    const roomCode = await startGame(owner, player);
    const originalIn = fake.io.in.bind(fake.io);
    let injected = false;
    vi.spyOn(fake.io, 'in').mockImplementation(((target: string) => {
      const view = originalIn(target);
      if (target !== roomCode || injected) return view;
      injected = true;
      return {
        ...view,
        fetchSockets: async () => {
          throw new Error('injected toggle projection failure');
        },
      };
    }) as typeof fake.io.in);

    await expect(player.call('player:toggle-autopilot')).resolves.toMatchObject({
      success: true,
      autopilot: true,
    });
    expect(injected).toBe(true);
    expect(
      handlers.sessions
        .get(roomCode)!
        .getFullState()
        .players.find(state => state.id === 'toggle_projection_player')?.autopilot,
    ).toBe(true);
  });
});

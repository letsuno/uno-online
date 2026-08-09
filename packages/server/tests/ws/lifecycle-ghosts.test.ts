import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import { setupSocketHandlers } from '../../src/ws/socket-handler';
import { dissolveRoom } from '../../src/ws/room-lifecycle';
import { getRoundEndVoteState, markTerminalHandled, reseedTerminalVotes } from '../../src/ws/game-events';
import {
  getRoom,
  getRoomSeats,
  getRoomSpectators,
  getUserRoom,
  pickNextOwner,
  setRoomStatus,
} from '../../src/plugins/core/room/store';
import { saveGameState } from '../../src/plugins/core/game/state-store';
import { GameSession } from '../../src/plugins/core/game/session';
import type { MumbleIceConfig } from '../../src/config';
import { makeFakeIo, type FakeSocket } from '../helpers/fake-io';
import { makeGameState, makePlayer, makeCard } from '../helpers/test-utils';
import { startTurnTimer } from '../../src/ws/room-events';
import { getDepartedMemberIds } from '../../src/ws/room-departure';

// Ghost-state regressions: stale user:room mappings, cross-room rejoin,
// orphaned seats/timers, vote deadlocks. Each test replays the user-visible
// trigger sequence through the real setupSocketHandlers stack.

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
const handlers = setupSocketHandlers(fake.io, kv, 'test-secret', 60_000, mumbleIce);

afterAll(() => {
  handlers.turnTimer.stopAll();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function createWaitingRoom(owner: FakeSocket, second: FakeSocket): Promise<string> {
  const created = await owner.call('room:create', {});
  expect(created.success).toBe(true);
  const roomCode = created.roomCode as string;
  expect((await second.call('room:join', roomCode)).success).toBe(true);
  expect((await second.call('seat:take', 1)).success).toBe(true);
  return roomCode;
}

async function readyAndStart(owner: FakeSocket, others: FakeSocket[]): Promise<void> {
  for (const s of others) expect((await s.call('room:ready', true)).success).toBe(true);
  expect((await owner.call('room:ready', true)).success).toBe(true);
  expect((await owner.call('game:start')).success).toBe(true);
}

describe('room:create compensation', () => {
  it('removes the room, owner seat and adapter when reverse mapping publication fails', async () => {
    const owner = await fake.connect('g0_create_mapping_owner', 'CreateMappingOwner');
    const roomKeysBefore = (await kv.keys('room:*')).sort();
    const originalSet = kv.set.bind(kv);
    let injected = false;
    vi.spyOn(kv, 'set').mockImplementation(async (key, value, ttlSeconds) => {
      if (!injected && key === 'user:g0_create_mapping_owner:room') {
        injected = true;
        throw new Error('injected create mapping failure');
      }
      await originalSet(key, value, ttlSeconds);
    });

    await expect(owner.call('room:create', {})).resolves.toMatchObject({ success: false });
    expect(injected).toBe(true);
    expect((await kv.keys('room:*')).sort()).toEqual(roomKeysBefore);
    expect(await getUserRoom(kv, 'g0_create_mapping_owner')).toBeNull();
    expect(owner.data.roomCode).toBeNull();
    expect([...owner.rooms].filter(room => !room.startsWith('user:'))).toEqual([]);

    await expect(owner.call('room:create', {})).resolves.toMatchObject({ success: true });
  });
});

describe('cross-room rejoin guard', () => {
  it('keeps a committed waiting-room return when governance reconciliation fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const owner = await fake.connect('g1_waiting_governance_owner', 'WaitingGovernanceOwner');
    const member = await fake.connect('g1_waiting_governance_member', 'WaitingGovernanceMember');
    const roomCode = await createWaitingRoom(owner, member);
    const originalBatch = kv.batchStrings.bind(kv);
    const originalHgetall = kv.hgetall.bind(kv);
    let connectionCommitted = false;
    let injected = false;
    vi.spyOn(kv, 'batchStrings').mockImplementation(async operations => {
      await originalBatch(operations);
      if (operations.some(operation => operation.key === `room:${roomCode}:departed`)) {
        connectionCommitted = true;
      }
    });
    vi.spyOn(kv, 'hgetall').mockImplementation(async key => {
      if (connectionCommitted && !injected && key === `room:${roomCode}`) {
        injected = true;
        throw new Error('injected governance room read failure');
      }
      return originalHgetall(key);
    });

    await expect(member.call('room:join', roomCode)).resolves.toMatchObject({ success: true });
    expect(injected).toBe(true);
    expect(member.data.roomCode).toBe(roomCode);
    expect(member.rooms.has(roomCode)).toBe(true);
    expect(
      (await getRoomSeats(kv, roomCode)).find(seat => seat?.userId === 'g1_waiting_governance_member'),
    ).toMatchObject({ connected: true });
  });

  it('leaves no roster, mapping, adapter or socket-data ghost when a durable join batch fails', async () => {
    const owner = await fake.connect('g1_join_batch_owner', 'JoinBatchOwner');
    const roomCode = (await owner.call('room:create', {})).roomCode as string;
    const guest = await fake.connect('g1_join_batch_guest', 'JoinBatchGuest');
    const originalBatch = kv.batchStrings.bind(kv);
    let injected = false;
    vi.spyOn(kv, 'batchStrings').mockImplementation(async operations => {
      if (
        !injected &&
        operations.some(operation => operation.type === 'set' && operation.key === 'user:g1_join_batch_guest:room')
      ) {
        injected = true;
        throw new Error('injected durable join failure');
      }
      await originalBatch(operations);
    });

    await expect(guest.call('room:join', roomCode)).resolves.toMatchObject({ success: false });
    expect(injected).toBe(true);
    expect((await getRoomSpectators(kv, roomCode)).some(item => item.userId === 'g1_join_batch_guest')).toBe(false);
    expect(await getUserRoom(kv, 'g1_join_batch_guest')).toBeNull();
    expect(guest.rooms.has(roomCode)).toBe(false);
    expect(guest.data.roomCode).toBeNull();

    await expect(guest.call('room:join', roomCode)).resolves.toMatchObject({ success: true });
  });

  it('atomically compensates durable membership when the room adapter join fails', async () => {
    const owner = await fake.connect('g1_join_adapter_owner', 'JoinAdapterOwner');
    const roomCode = (await owner.call('room:create', {})).roomCode as string;
    const guest = await fake.connect('g1_join_adapter_guest', 'JoinAdapterGuest');
    const originalJoin = guest.join.bind(guest);
    let failAdapterJoin = true;
    guest.join = (target: string) => {
      if (target === roomCode && failAdapterJoin) throw new Error('injected adapter join failure');
      originalJoin(target);
    };

    await expect(guest.call('room:join', roomCode)).resolves.toMatchObject({ success: false });
    expect((await getRoomSpectators(kv, roomCode)).some(item => item.userId === 'g1_join_adapter_guest')).toBe(false);
    expect(await getUserRoom(kv, 'g1_join_adapter_guest')).toBeNull();
    expect(guest.rooms.has(roomCode)).toBe(false);
    expect(guest.data.roomCode).toBeNull();

    failAdapterJoin = false;
    await expect(guest.call('room:join', roomCode)).resolves.toMatchObject({ success: true });
  });

  it('returns the committed join when a post-commit roster projection read fails', async () => {
    const owner = await fake.connect('g1_join_projection_owner', 'JoinProjectionOwner');
    const roomCode = (await owner.call('room:create', {})).roomCode as string;
    const guest = await fake.connect('g1_join_projection_guest', 'JoinProjectionGuest');
    const originalBatch = kv.batchStrings.bind(kv);
    const originalGet = kv.get.bind(kv);
    let membershipCommitted = false;
    let injected = false;
    vi.spyOn(kv, 'batchStrings').mockImplementation(async operations => {
      await originalBatch(operations);
      if (
        operations.some(operation => operation.type === 'set' && operation.key === 'user:g1_join_projection_guest:room')
      )
        membershipCommitted = true;
    });
    vi.spyOn(kv, 'get').mockImplementation(async key => {
      if (membershipCommitted && !injected && key === `room:${roomCode}:spectators`) {
        injected = true;
        throw new Error('injected post-commit projection failure');
      }
      return originalGet(key);
    });

    await expect(guest.call('room:join', roomCode)).resolves.toMatchObject({ success: true });
    expect(injected).toBe(true);
    expect(await getUserRoom(kv, 'g1_join_projection_guest')).toBe(roomCode);
    expect(guest.rooms.has(roomCode)).toBe(true);
    expect(guest.data.roomCode).toBe(roomCode);
  });

  it('serializes concurrent joins so one user cannot remain in two rosters', async () => {
    const ownerA = await fake.connect('g1_race_owner_a', 'RaceOwnerA');
    const ownerB = await fake.connect('g1_race_owner_b', 'RaceOwnerB');
    const roomA = (await ownerA.call('room:create', {})).roomCode as string;
    const roomB = (await ownerB.call('room:create', {})).roomCode as string;
    const guest = await fake.connect('g1_race_guest', 'RaceGuest');

    const results = await Promise.all([guest.call('room:join', roomA), guest.call('room:join', roomB)]);
    expect(results.filter(result => result.success)).toHaveLength(1);
    const memberships = await Promise.all([getRoomSpectators(kv, roomA), getRoomSpectators(kv, roomB)]);
    expect(memberships.flat().filter(member => member.userId === 'g1_race_guest')).toHaveLength(1);
    expect([roomA, roomB]).toContain(await getUserRoom(kv, 'g1_race_guest'));
  });

  it('rejects rejoin into another room while still a member elsewhere', async () => {
    const ownerX = await fake.connect('g1_ownerX', 'OwnerX');
    expect(ownerX.rooms.has('user:g1_ownerX')).toBe(true);
    const member = await fake.connect('g1_member', 'Member');
    const roomX = await createWaitingRoom(ownerX, member);

    const ownerY = await fake.connect('g1_ownerY', 'OwnerY');
    const createdY = await ownerY.call('room:create', {});
    const roomY = createdY.roomCode as string;

    const res = await member.call('room:rejoin', roomY);
    expect(res.success).toBe(false);
    expect(res.error).toContain('你已在房间');

    // No trace of the member may leak into room Y, and their real room
    // membership must be untouched.
    expect((await getRoomSpectators(kv, roomY)).some(s => s.userId === 'g1_member')).toBe(false);
    expect(member.rooms.has(roomY)).toBe(false);
    expect(await getUserRoom(kv, 'g1_member')).toBe(roomX);
    expect((await getRoomSeats(kv, roomX)).some(s => s?.userId === 'g1_member')).toBe(true);
  });

  it('rejoining a dead room code does not clear the mapping to the real room', async () => {
    const owner = await fake.connect('g2_owner', 'Owner2');
    const member = await fake.connect('g2_member', 'Member2');
    const roomX = await createWaitingRoom(owner, member);

    const res = await member.call('room:rejoin', 'ZZZZ99');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Room not found');
    expect(await getUserRoom(kv, 'g2_member')).toBe(roomX);
  });
});

describe('game:start guard', () => {
  it('keeps the committed game driven and acknowledges success when socket projection fails', async () => {
    const owner = await fake.connect('g3_projection_owner', 'ProjectionOwner');
    const p2 = await fake.connect('g3_projection_p2', 'ProjectionP2');
    const roomCode = await createWaitingRoom(owner, p2);
    expect((await p2.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);

    const originalIn = fake.io.in.bind(fake.io);
    let injected = false;
    vi.spyOn(fake.io, 'in').mockImplementation(((target: string) => {
      const roomView = originalIn(target);
      if (target !== roomCode || injected) return roomView;
      injected = true;
      return {
        ...roomView,
        fetchSockets: async () => {
          throw new Error('injected socket projection failure');
        },
      };
    }) as typeof fake.io.in);

    await expect(owner.call('game:start')).resolves.toMatchObject({ success: true });
    expect(injected).toBe(true);
    expect(handlers.sessions.has(roomCode)).toBe(true);
    expect((await getRoom(kv, roomCode))?.status).toBe('playing');
    expect(handlers.turnTimer.isRunning(roomCode)).toBe(true);
    handlers.turnTimer.stop(roomCode);
  });

  it('rejects a second start while a session is live and during the scoreboard', async () => {
    const owner = await fake.connect('g3_owner', 'Owner3');
    const p2 = await fake.connect('g3_p2', 'P3b');
    const roomCode = await createWaitingRoom(owner, p2);
    await readyAndStart(owner, [p2]);

    const firstSession = handlers.sessions.get(roomCode);
    expect(firstSession).toBeDefined();

    const again = await owner.call('game:start');
    expect(again.success).toBe(false);
    expect(again.error).toBe('游戏已开始');
    expect(handlers.sessions.get(roomCode)).toBe(firstSession);

    // Scoreboard (finished): seats still occupied and ready — must still refuse.
    firstSession!.forceGameOver('g3_owner');
    await setRoomStatus(kv, roomCode, 'finished');
    const duringScoreboard = await owner.call('game:start');
    expect(duringScoreboard.success).toBe(false);
    expect(handlers.sessions.get(roomCode)).toBe(firstSession);
  });
});

describe('kick of an offline member', () => {
  it('keeps roster and mapping retryable when the atomic kick batch fails', async () => {
    const owner = await fake.connect('g4_atomic_owner', 'AtomicKickOwner');
    const target = await fake.connect('g4_atomic_target', 'AtomicKickTarget');
    const roomCode = await createWaitingRoom(owner, target);
    const originalBatch = kv.batchStrings.bind(kv);
    let injected = false;
    vi.spyOn(kv, 'batchStrings').mockImplementation(async operations => {
      if (
        !injected &&
        operations.some(operation => operation.type === 'del' && operation.key === 'user:g4_atomic_target:room')
      ) {
        injected = true;
        throw new Error('injected kick membership failure');
      }
      await originalBatch(operations);
    });

    await expect(owner.call('room:kick', { targetId: 'g4_atomic_target' })).resolves.toMatchObject({ success: false });
    expect((await getRoomSeats(kv, roomCode)).some(seat => seat?.userId === 'g4_atomic_target')).toBe(true);
    expect(await getUserRoom(kv, 'g4_atomic_target')).toBe(roomCode);
    expect(target.data.roomCode).toBe(roomCode);

    await expect(owner.call('room:kick', { targetId: 'g4_atomic_target' })).resolves.toMatchObject({ success: true });
    expect((await getRoomSeats(kv, roomCode)).some(seat => seat?.userId === 'g4_atomic_target')).toBe(false);
    expect(await getUserRoom(kv, 'g4_atomic_target')).toBeNull();
  });

  it('clears user:room so the kicked player is not auto-bounced back in', async () => {
    const owner = await fake.connect('g4_owner', 'Owner4');
    const target = await fake.connect('g4_target', 'Target4');
    const roomCode = await createWaitingRoom(owner, target);

    await target.trigger('disconnect');
    expect((await owner.call('room:kick', { targetId: 'g4_target' })).success).toBe(true);

    expect(await getUserRoom(kv, 'g4_target')).toBeNull();
    expect(fake.lastRoomEmit('user:g4_target', 'room:membership_ended')).toEqual({
      roomCode,
      reason: 'kicked',
    });

    // Reconnect: lobby lookup finds nothing, and the player is free to
    // create a new room instead of being revived into the old one.
    const targetBack = await fake.connect('g4_target', 'Target4');
    const current = await targetBack.call('user:current_room');
    expect(current.roomCode).toBeNull();
    const created = await targetBack.call('room:create', {});
    expect(created.success).toBe(true);
    expect(await getUserRoom(kv, 'g4_target')).toBe(created.roomCode);
  });
});

describe('waiting membership transaction', () => {
  it('keeps a seated member fully joined when atomic leave fails, then allows retry', async () => {
    const owner = await fake.connect('g4_leave_owner', 'AtomicLeaveOwner');
    const member = await fake.connect('g4_leave_member', 'AtomicLeaveMember');
    const roomCode = await createWaitingRoom(owner, member);
    const originalBatch = kv.batchStrings.bind(kv);
    let injected = false;
    vi.spyOn(kv, 'batchStrings').mockImplementation(async operations => {
      if (
        !injected &&
        operations.some(operation => operation.type === 'del' && operation.key === 'user:g4_leave_member:room')
      ) {
        injected = true;
        throw new Error('injected leave membership failure');
      }
      await originalBatch(operations);
    });

    await expect(member.call('room:leave')).resolves.toMatchObject({ success: false });
    expect((await getRoomSeats(kv, roomCode)).some(seat => seat?.userId === 'g4_leave_member')).toBe(true);
    expect(await getUserRoom(kv, 'g4_leave_member')).toBe(roomCode);
    expect(member.data.roomCode).toBe(roomCode);
    expect(member.rooms.has(roomCode)).toBe(true);

    await expect(member.call('room:leave')).resolves.toMatchObject({ success: true });
    expect((await getRoomSeats(kv, roomCode)).some(seat => seat?.userId === 'g4_leave_member')).toBe(false);
    expect(await getUserRoom(kv, 'g4_leave_member')).toBeNull();
    expect(member.data.roomCode).toBeNull();
  });
});

describe('membership termination notifications', () => {
  it('notifies every mapped human when the room is dissolved', async () => {
    const owner = await fake.connect('g4_dissolve_owner', 'DissolveOwner4');
    const member = await fake.connect('g4_dissolve_member', 'DissolveMember4');
    const roomCode = await createWaitingRoom(owner, member);

    expect((await owner.call('room:dissolve')).success).toBe(true);
    expect(fake.lastRoomEmit('user:g4_dissolve_owner', 'room:membership_ended')).toEqual({
      roomCode,
      reason: 'host_closed',
    });
    expect(fake.lastRoomEmit('user:g4_dissolve_member', 'room:membership_ended')).toEqual({
      roomCode,
      reason: 'host_closed',
    });
  });
});

describe('reconnection no longer cancels foreign cleanup timers', () => {
  it('restores a waiting seat when adapter rejoin fails and allows the same socket to retry', async () => {
    const owner = await fake.connect('g5_wait_rejoin_owner', 'WaitRejoinOwner');
    const member = await fake.connect('g5_wait_rejoin_member', 'WaitRejoinMember');
    const roomCode = await createWaitingRoom(owner, member);
    await member.trigger('disconnect');
    const back = await fake.connect('g5_wait_rejoin_member', 'WaitRejoinMember');
    const originalJoin = back.join.bind(back);
    let failAdapter = true;
    back.join = (target: string) => {
      if (target === roomCode && failAdapter) throw new Error('injected waiting rejoin adapter failure');
      originalJoin(target);
    };

    await expect(back.call('room:rejoin', roomCode)).resolves.toMatchObject({ success: false });
    expect((await getRoomSeats(kv, roomCode)).find(seat => seat?.userId === 'g5_wait_rejoin_member')).toMatchObject({
      connected: false,
    });
    expect(await getUserRoom(kv, 'g5_wait_rejoin_member')).toBe(roomCode);
    expect(back.data.roomCode).toBeNull();
    expect(back.rooms.has(roomCode)).toBe(false);

    failAdapter = false;
    await expect(back.call('room:rejoin', roomCode)).resolves.toMatchObject({ success: true });
    expect((await getRoomSeats(kv, roomCode)).find(seat => seat?.userId === 'g5_wait_rejoin_member')).toMatchObject({
      connected: true,
    });
    expect(back.data.roomCode).toBe(roomCode);
  });

  it('a waiting-room ghost seat is still cleaned up after the user reconnects elsewhere', async () => {
    vi.useFakeTimers();
    const owner = await fake.connect('g5_owner', 'Owner5');
    const drifter = await fake.connect('g5_drifter', 'Drifter5');
    const roomCode = await createWaitingRoom(owner, drifter);

    await drifter.trigger('disconnect');
    // Bare reconnection (e.g. a second tab opening the lobby) must NOT
    // cancel the pending seat cleanup for the room they never returned to.
    await fake.connect('g5_drifter', 'Drifter5');

    await vi.advanceTimersByTimeAsync(31_000);

    expect((await getRoomSeats(kv, roomCode)).some(s => s?.userId === 'g5_drifter')).toBe(false);
    expect(await getUserRoom(kv, 'g5_drifter')).toBeNull();
  });

  it('someone who re-entered via room:join before the timer fires is not evicted', async () => {
    vi.useFakeTimers();
    const owner = await fake.connect('g9_owner', 'Owner9');
    const returner = await fake.connect('g9_ret', 'Returner9');
    const roomCode = await createWaitingRoom(owner, returner);

    await returner.trigger('disconnect');
    // room:join's already-in-room branch rejoins the broadcast group but has
    // no access to the cleanup timer — the timer must notice the live socket.
    const back = await fake.connect('g9_ret', 'Returner9');
    expect((await back.call('room:join', roomCode)).success).toBe(true);

    await vi.advanceTimersByTimeAsync(31_000);

    expect((await getRoomSeats(kv, roomCode)).some(s => s?.userId === 'g9_ret')).toBe(true);
    expect(await getUserRoom(kv, 'g9_ret')).toBe(roomCode);
  });

  it('active room:join only redirects and cannot cancel disconnect governance', async () => {
    vi.useFakeTimers();
    const owner = await fake.connect('g9_active_owner', 'ActiveOwner9');
    const player = await fake.connect('g9_active_player', 'ActivePlayer9');
    const roomCode = await createWaitingRoom(owner, player);
    await readyAndStart(owner, [player]);

    await player.trigger('disconnect');
    const redirected = await fake.connect('g9_active_player', 'ActivePlayer9');
    const joined = await redirected.call('room:join', roomCode);
    expect(joined).toMatchObject({ success: true, rejoin: true });
    expect(redirected.rooms.has(roomCode)).toBe(false);
    expect(
      handlers.sessions
        .get(roomCode)!
        .getFullState()
        .players.find(candidate => candidate.id === 'g9_active_player')?.connected,
    ).toBe(false);

    await vi.advanceTimersByTimeAsync(31_000);
    expect(
      handlers.sessions
        .get(roomCode)!
        .getFullState()
        .players.find(candidate => candidate.id === 'g9_active_player')?.autopilot,
    ).toBe(true);
    handlers.turnTimer.stop(roomCode);
  });

  it('multi-tab: a second connection kicks the first socket cleanly', async () => {
    const first = await fake.connect('g10_dup', 'Dup10');
    await fake.connect('g10_dup', 'Dup10');
    expect(first.lastEmit('auth:kicked')).toBeDefined();
  });

  it('a late disconnect from the superseded tab cannot disconnect the replacement', async () => {
    const first = await fake.connect('g10_live_dup', 'LiveDup');
    const other = await fake.connect('g10_live_other', 'LiveOther');
    const roomCode = await createWaitingRoom(first, other);
    await readyAndStart(first, [other]);

    const replacement = await fake.connect('g10_live_dup', 'LiveDup');
    expect((await replacement.call('room:rejoin', roomCode)).success).toBe(true);

    // Re-run the old callback after the replacement is fully in the adapter
    // room to deterministically model a delayed multi-tab disconnect.
    await first.trigger('disconnect');

    const player = handlers.sessions
      .get(roomCode)!
      .getFullState()
      .players.find(candidate => candidate.id === 'g10_live_dup');
    expect(player).toMatchObject({ connected: true, autopilot: false });
    expect((await getRoomSeats(kv, roomCode)).find(seat => seat?.userId === 'g10_live_dup')?.connected).toBe(true);
  });
});

describe('in-game leave keeps seat connectivity honest', () => {
  it('still commits an active-player disconnect when the spectator roster read fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const owner = await fake.connect('g6_dc_read_owner', 'DisconnectReadOwner');
    const member = await fake.connect('g6_dc_read_member', 'DisconnectReadMember');
    const roomCode = await createWaitingRoom(owner, member);
    await readyAndStart(owner, [member]);
    const session = handlers.sessions.get(roomCode)!;
    const originalGet = kv.get.bind(kv);
    let injected = false;
    vi.spyOn(kv, 'get').mockImplementation(async key => {
      if (!injected && key === `room:${roomCode}:spectators`) {
        injected = true;
        throw new Error('injected spectator roster read failure');
      }
      return originalGet(key);
    });

    await member.trigger('disconnect');

    expect(injected).toBe(true);
    expect(session.getFullState().players.find(player => player.id === 'g6_dc_read_member')).toMatchObject({
      connected: false,
    });
    expect((await getRoomSeats(kv, roomCode)).find(seat => seat?.userId === 'g6_dc_read_member')).toMatchObject({
      connected: false,
    });
  });

  it('does not restart the active player clock when a different player leaves', async () => {
    const first = await fake.connect('g6_clock_first', 'ClockFirst');
    const second = await fake.connect('g6_clock_second', 'ClockSecond');
    const third = await fake.connect('g6_clock_third', 'ClockThird');
    const roomCode = await createWaitingRoom(first, second);
    expect((await third.call('room:join', roomCode)).success).toBe(true);
    expect((await third.call('seat:take', 2)).success).toBe(true);
    await readyAndStart(first, [second, third]);

    const state = handlers.sessions.get(roomCode)!.getFullState();
    const actionPlayerId = state.players[state.currentPlayerIndex]?.id;
    const sockets = new Map([
      ['g6_clock_first', first],
      ['g6_clock_second', second],
      ['g6_clock_third', third],
    ]);
    const nonActionSocket = [...sockets.entries()].find(([id]) => id !== actionPlayerId)?.[1];
    expect(nonActionSocket).toBeDefined();

    const startSpy = vi.spyOn(handlers.turnTimer, 'start');
    startSpy.mockClear();
    await expect(nonActionSocket!.call('room:leave')).resolves.toMatchObject({
      success: true,
      outcome: 'suspended',
    });
    expect(startSpy).not.toHaveBeenCalled();
    expect(handlers.turnTimer.isRunning(roomCode)).toBe(true);
  });

  it('redispatches immediately when the player responsible for the action leaves', async () => {
    const first = await fake.connect('g6_action_first', 'ActionFirst');
    const second = await fake.connect('g6_action_second', 'ActionSecond');
    const third = await fake.connect('g6_action_third', 'ActionThird');
    const roomCode = await createWaitingRoom(first, second);
    expect((await third.call('room:join', roomCode)).success).toBe(true);
    expect((await third.call('seat:take', 2)).success).toBe(true);
    await readyAndStart(first, [second, third]);

    const state = handlers.sessions.get(roomCode)!.getFullState();
    const actionPlayerId = state.players[state.currentPlayerIndex]!.id;
    const actionSocket = new Map([
      ['g6_action_first', first],
      ['g6_action_second', second],
      ['g6_action_third', third],
    ]).get(actionPlayerId);
    expect(actionSocket).toBeDefined();

    const startSpy = vi.spyOn(handlers.turnTimer, 'start');
    startSpy.mockClear();
    await expect(actionSocket!.call('room:leave')).resolves.toMatchObject({
      success: true,
      outcome: 'suspended',
    });
    expect(startSpy).toHaveBeenCalled();
  });

  it('rolls back a failed suspension on the same session and keeps its turn driver retryable', async () => {
    const first = await fake.connect('g6_fail_first', 'FailFirst');
    const second = await fake.connect('g6_fail_second', 'FailSecond');
    const roomCode = await createWaitingRoom(first, second);
    await readyAndStart(first, [second]);
    const session = handlers.sessions.get(roomCode)!;
    expect(handlers.turnTimer.isRunning(roomCode)).toBe(true);

    const originalBatch = kv.batchStrings.bind(kv);
    let injected = false;
    vi.spyOn(kv, 'batchStrings').mockImplementation(async operations => {
      if (
        !injected &&
        operations.some(operation => operation.type === 'set' && operation.key === `room:${roomCode}:departed`)
      ) {
        injected = true;
        throw new Error('injected active suspension failure');
      }
      await originalBatch(operations);
    });

    await expect(first.call('room:leave')).resolves.toMatchObject({ success: false });
    expect(handlers.sessions.get(roomCode)).toBe(session);
    expect(session.getFullState().players.find(player => player.id === 'g6_fail_first')).toMatchObject({
      connected: true,
      autopilot: false,
    });
    expect((await getRoomSeats(kv, roomCode)).find(seat => seat?.userId === 'g6_fail_first')).toMatchObject({
      connected: true,
    });
    expect((await getDepartedMemberIds(kv, roomCode)).has('g6_fail_first')).toBe(false);
    expect(first.data.roomCode).toBe(roomCode);
    expect(first.rooms.has(roomCode)).toBe(true);
    expect(handlers.turnTimer.isRunning(roomCode)).toBe(true);

    // The other player's explicit leave must not count the failed caller as
    // departed and dissolve the room.
    await expect(second.call('room:leave')).resolves.toMatchObject({ success: true, outcome: 'suspended' });
    expect(await getRoom(kv, roomCode)).not.toBeNull();

    // Retrying the original leave now observes the other departure and uses
    // the final-human durable dissolve path.
    await expect(first.call('room:leave')).resolves.toMatchObject({ success: true, outcome: 'dissolved' });
    expect(await getRoom(kv, roomCode)).toBeNull();
  });

  it('keeps a final active member fully live when durable room deletion fails', async () => {
    const owner = await fake.connect('g6_final_delete_owner', 'FinalDeleteOwner');
    const roomCode = (await owner.call('room:create', {})).roomCode as string;
    expect((await owner.call('room:add_bot', { difficulty: 'easy' })).success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('game:start')).success).toBe(true);
    const session = handlers.sessions.get(roomCode)!;
    const originalDel = kv.del.bind(kv);
    let injected = false;
    vi.spyOn(kv, 'del').mockImplementation(async (...keys) => {
      if (!injected && keys.includes(`room:${roomCode}`)) {
        injected = true;
        throw new Error('injected final room delete failure');
      }
      await originalDel(...keys);
    });

    await expect(owner.call('room:leave')).resolves.toMatchObject({ success: false });
    expect(await getRoom(kv, roomCode)).not.toBeNull();
    expect(handlers.sessions.get(roomCode)).toBe(session);
    expect((await getDepartedMemberIds(kv, roomCode)).has('g6_final_delete_owner')).toBe(false);
    expect(owner.data.roomCode).toBe(roomCode);
    expect(owner.rooms.has(roomCode)).toBe(true);

    await expect(owner.call('room:leave')).resolves.toMatchObject({ success: true, outcome: 'dissolved' });
    expect(await getRoom(kv, roomCode)).toBeNull();
  });

  it('preserves the player, hand and room mapping while enabling immediate autopilot', async () => {
    const owner = await fake.connect('g6_owner', 'Owner6');
    const leaver = await fake.connect('g6_leaver', 'Leaver6');
    const stayer = await fake.connect('g6_stayer', 'Stayer6');

    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;
    expect((await leaver.call('room:join', roomCode)).success).toBe(true);
    expect((await leaver.call('seat:take', 1)).success).toBe(true);
    expect((await stayer.call('room:join', roomCode)).success).toBe(true);
    expect((await stayer.call('seat:take', 2)).success).toBe(true);
    await readyAndStart(owner, [leaver, stayer]);

    const session = handlers.sessions.get(roomCode)!;
    const handIds = session
      .getFullState()
      .players.find(player => player.id === 'g6_leaver')!
      .hand.map(card => card.id);

    expect(await leaver.call('room:leave')).toMatchObject({ success: true, outcome: 'suspended' });

    const seat = (await getRoomSeats(kv, roomCode)).find(s => s?.userId === 'g6_leaver');
    expect(seat?.connected).toBe(false);
    const suspended = session.getFullState().players.find(player => player.id === 'g6_leaver')!;
    expect(suspended.connected).toBe(false);
    expect(suspended.autopilot).toBe(true);
    expect(suspended.hand.map(card => card.id)).toEqual(handIds);
    expect(await getUserRoom(kv, 'g6_leaver')).toBe(roomCode);
    expect((await leaver.call('room:create', {})).success).toBe(false);
    expect(pickNextOwner(await getRoomSeats(kv, roomCode), await getRoomSpectators(kv, roomCode), 'g6_owner')).toBe(
      'g6_stayer',
    );

    const rejoined = await leaver.call('room:rejoin', roomCode);
    expect(rejoined.success).toBe(true);
    const resumed = session.getFullState().players.find(player => player.id === 'g6_leaver')!;
    expect(resumed.connected).toBe(true);
    expect(resumed.autopilot).toBe(false);
    expect(resumed.hand.map(card => card.id)).toEqual(handIds);

    expect(await owner.call('room:leave')).toMatchObject({ success: true, outcome: 'suspended' });
    expect((await getRoom(kv, roomCode))!.ownerId).toBe('g6_leaver');
    expect(await getUserRoom(kv, 'g6_owner')).toBe(roomCode);
  });

  it('dissolves immediately when the final human leaves a bots-only active room', async () => {
    const owner = await fake.connect('g6_last', 'LastHuman');
    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;
    expect((await owner.call('room:add_bot', { difficulty: 'easy' })).success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('game:start')).success).toBe(true);

    const left = await owner.call('room:leave');
    expect(left).toMatchObject({ success: true, outcome: 'dissolved' });
    expect(await getRoom(kv, roomCode)).toBeNull();
    expect(await getUserRoom(kv, 'g6_last')).toBeNull();
    expect(handlers.sessions.has(roomCode)).toBe(false);
  });

  it('dissolves when two active players explicitly leave one after the other', async () => {
    const owner = await fake.connect('g6_seq_owner', 'SeqOwner');
    const other = await fake.connect('g6_seq_other', 'SeqOther');
    const roomCode = await createWaitingRoom(owner, other);
    await readyAndStart(owner, [other]);

    expect(await owner.call('room:leave')).toMatchObject({ success: true, outcome: 'suspended' });
    expect(await getRoom(kv, roomCode)).not.toBeNull();

    expect(await other.call('room:leave')).toMatchObject({ success: true, outcome: 'dissolved' });
    expect(await getRoom(kv, roomCode)).toBeNull();
    expect(handlers.sessions.has(roomCode)).toBe(false);
  });

  it('persists explicit-departure intent across session restoration', async () => {
    const first = await fake.connect('g6_restart_first', 'RestartFirst');
    const second = await fake.connect('g6_restart_second', 'RestartSecond');
    const roomCode = await createWaitingRoom(first, second);
    await readyAndStart(first, [second]);

    expect(await first.call('room:leave')).toMatchObject({ success: true, outcome: 'suspended' });
    handlers.turnTimer.stop(roomCode);
    handlers.sessions.delete(roomCode);

    // The second player's rejoin restores the session from KV. The first
    // player's explicit-departure marker is a separate durable room record
    // and must still count when the second player then leaves explicitly.
    expect((await second.call('room:rejoin', roomCode)).success).toBe(true);
    expect(await second.call('room:leave')).toMatchObject({ success: true, outcome: 'dissolved' });
    expect(await getRoom(kv, roomCode)).toBeNull();
  });

  it('preserves a disconnected player when the other player explicitly leaves', async () => {
    const owner = await fake.connect('g6_dc_owner', 'DcOwner');
    const other = await fake.connect('g6_dc_other', 'DcOther');
    const roomCode = await createWaitingRoom(owner, other);
    await readyAndStart(owner, [other]);
    await other.trigger('disconnect');

    expect(await owner.call('room:leave')).toMatchObject({ success: true, outcome: 'suspended' });
    expect(await getRoom(kv, roomCode)).not.toBeNull();
    expect(handlers.sessions.has(roomCode)).toBe(true);

    const reconnected = await fake.connect('g6_dc_other', 'DcOther');
    expect((await reconnected.call('room:rejoin', roomCode)).success).toBe(true);
    expect(
      handlers.sessions
        .get(roomCode)!
        .getFullState()
        .players.find(player => player.id === 'g6_dc_other')?.connected,
    ).toBe(true);
  });

  it('keeps the active room while a live spectator remains', async () => {
    const owner = await fake.connect('g6_spec_owner', 'SpecOwner');
    const other = await fake.connect('g6_spec_other', 'SpecOther');
    const spectator = await fake.connect('g6_live_spec', 'LiveSpec');
    const roomCode = await createWaitingRoom(owner, other);
    expect((await spectator.call('room:join', roomCode)).success).toBe(true);
    await readyAndStart(owner, [other]);

    expect(await owner.call('room:leave')).toMatchObject({ success: true, outcome: 'suspended' });
    expect(await other.call('room:leave')).toMatchObject({ success: true, outcome: 'suspended' });
    expect(await getRoom(kv, roomCode)).not.toBeNull();

    expect(await spectator.call('room:leave')).toMatchObject({ success: true, outcome: 'dissolved' });
    expect(await getRoom(kv, roomCode)).toBeNull();
  });

  it('does not half-remove the final host beside a departed spectator when delete fails', async () => {
    const owner = await fake.connect('g6_persistent_owner', 'PersistentOwner');
    const departed = await fake.connect('g6_persistent_departed', 'PersistentDeparted');
    const roomCode = await createWaitingRoom(owner, departed);
    await readyAndStart(owner, [departed]);

    expect(await departed.call('room:leave')).toMatchObject({ success: true, outcome: 'suspended' });
    handlers.sessions.get(roomCode)!.forceGameOver('g6_persistent_owner');
    markTerminalHandled(roomCode, Date.now() - 10_001);
    expect(await owner.call('game:back_to_room')).toMatchObject({ success: true });
    expect(
      (await getRoomSpectators(kv, roomCode)).find(spectator => spectator.userId === 'g6_persistent_departed'),
    ).toMatchObject({ connected: false });
    expect((await getDepartedMemberIds(kv, roomCode)).has('g6_persistent_departed')).toBe(true);

    const originalDel = kv.del.bind(kv);
    let injected = false;
    vi.spyOn(kv, 'del').mockImplementation(async (...keys) => {
      if (!injected && keys.includes(`room:${roomCode}`)) {
        injected = true;
        throw new Error('injected persistent room delete failure');
      }
      await originalDel(...keys);
    });

    await expect(owner.call('room:leave')).resolves.toMatchObject({ success: false });
    expect((await getRoomSpectators(kv, roomCode)).map(item => item.userId).sort()).toEqual([
      'g6_persistent_departed',
      'g6_persistent_owner',
    ]);
    expect(await getUserRoom(kv, 'g6_persistent_owner')).toBe(roomCode);
    expect(owner.data.roomCode).toBe(roomCode);
    expect(owner.rooms.has(roomCode)).toBe(true);

    await expect(owner.call('room:leave')).resolves.toMatchObject({ success: true, outcome: 'dissolved' });
    expect(await getRoom(kv, roomCode)).toBeNull();
  });

  it('preserves a waiting room member who only lost their network connection', async () => {
    const owner = await fake.connect('g6_wait_owner', 'WaitOwner');
    const offline = await fake.connect('g6_wait_offline', 'WaitOffline');
    const roomCode = await createWaitingRoom(owner, offline);
    await offline.trigger('disconnect');

    expect(await owner.call('room:leave')).toMatchObject({ success: true });
    expect(await getRoom(kv, roomCode)).not.toBeNull();
    expect(await getUserRoom(kv, 'g6_wait_offline')).toBe(roomCode);

    const reconnected = await fake.connect('g6_wait_offline', 'WaitOffline');
    expect((await reconnected.call('room:rejoin', roomCode)).success).toBe(true);
  });

  it('does not allow manual owner transfer to an offline seat', async () => {
    const owner = await fake.connect('g4_owner_transfer', 'TransferOwner');
    const target = await fake.connect('g4_offline_transfer', 'OfflineTarget');
    const roomCode = await createWaitingRoom(owner, target);
    await target.trigger('disconnect');

    await expect(owner.call('room:transfer_owner', { targetId: 'g4_offline_transfer' })).resolves.toMatchObject({
      success: false,
      error: '只能移交给在线且在座的玩家',
    });
    expect((await getRoom(kv, roomCode))!.ownerId).toBe('g4_owner_transfer');
  });
});

describe('game-over return preserves offline human membership', () => {
  it('keeps an offline player as a spectator who can rejoin', async () => {
    const owner = await fake.connect('g7_owner', 'Owner7');
    const orphan = await fake.connect('g7_orphan', 'Orphan7');
    const filler = await fake.connect('g7_filler', 'Filler7');

    const created = await owner.call('room:create', { allowSpectators: false });
    const roomCode = created.roomCode as string;
    expect((await orphan.call('room:join', roomCode)).success).toBe(true);
    expect((await orphan.call('seat:take', 1)).success).toBe(true);
    expect((await filler.call('room:join', roomCode)).success).toBe(true);
    await readyAndStart(owner, [orphan]);

    // The player drops mid-game; the match ends and everyone returns to the
    // waiting room. Offline humans must remain authoritative room members.
    await orphan.trigger('disconnect');
    handlers.sessions.get(roomCode)!.forceGameOver('g7_owner');
    markTerminalHandled(roomCode, Date.now() - 10_001);
    expect((await owner.call('game:back_to_room')).success).toBe(true);
    expect(await getUserRoom(kv, 'g7_orphan')).toBe(roomCode);

    expect((await owner.call('seat:take', 0)).success).toBe(true);
    expect((await filler.call('seat:take', 1)).success).toBe(true);
    await readyAndStart(owner, [filler]);

    const retained = (await getRoomSpectators(kv, roomCode)).find(spectator => spectator.userId === 'g7_orphan');
    expect(retained).toMatchObject({ connected: false });

    // A retained member may rejoin even though outsider spectating is off.
    const orphanBack = await fake.connect('g7_orphan', 'Orphan7');
    const rejoined = await orphanBack.call('room:rejoin', roomCode);
    expect(rejoined.success).toBe(true);
    expect(rejoined.mode).toBe('spectator');
    expect(await getUserRoom(kv, 'g7_orphan')).toBe(roomCode);
    expect((await orphanBack.call('room:create', {})).success).toBe(false);
  });

  it('does not let a concurrent raw disconnect delete a newly retained spectator', async () => {
    vi.useFakeTimers();
    const owner = await fake.connect('g7_race_owner', 'RaceOwner7');
    const player = await fake.connect('g7_race_player', 'RacePlayer7');
    const roomCode = await createWaitingRoom(owner, player);
    await readyAndStart(owner, [player]);

    handlers.sessions.get(roomCode)!.forceGameOver('g7_race_owner');
    markTerminalHandled(roomCode, Date.now() - 10_001);

    const transition = owner.call('game:back_to_room');
    const disconnect = player.trigger('disconnect');
    const [result] = await Promise.all([transition, disconnect]);
    expect(result.success).toBe(true);

    expect(
      (await getRoomSpectators(kv, roomCode)).find(spectator => spectator.userId === 'g7_race_player'),
    ).toMatchObject({ connected: false });

    await vi.advanceTimersByTimeAsync(31_000);
    expect(
      (await getRoomSpectators(kv, roomCode)).find(spectator => spectator.userId === 'g7_race_player'),
    ).toMatchObject({ connected: false });
    expect(await getUserRoom(kv, 'g7_race_player')).toBe(roomCode);
  });
});

describe('spectator queue promotion at round boundary', () => {
  it('a queued spectator is seated as a player when the next round starts', async () => {
    const owner = await fake.connect('g11_owner', 'Owner11');
    const p2 = await fake.connect('g11_p2', 'P11b');
    const roomCode = await createWaitingRoom(owner, p2);
    await readyAndStart(owner, [p2]);

    const spec = await fake.connect('g11_spec', 'Spec11');
    const joined = await spec.call('room:rejoin', roomCode);
    expect(joined.success).toBe(true);
    expect(joined.mode).toBe('spectator');

    const queued = await spec.call('game:spectator_join');
    expect(queued.success).toBe(true);
    expect(queued.queued).toBe(true);

    // Jump the live session to round_end deterministically.
    const roundEnd = makeGameState({
      phase: 'round_end',
      players: [makePlayer('g11_owner'), makePlayer('g11_p2')],
    });
    handlers.sessions.set(roomCode, GameSession.fromState(roundEnd));
    markTerminalHandled(roomCode, Date.now() - 10_001);

    expect((await owner.call('game:next_round')).success).toBe(true);
    expect((await p2.call('game:next_round')).success).toBe(true);
    const started = await owner.call('game:next_round');
    expect(started.success).toBe(true);
    expect(started.started).toBe(true);

    const session = handlers.sessions.get(roomCode)!;
    const state = session.getFullState();
    expect(state.roundNumber).toBe(2);
    expect(state.players.some(p => p.id === 'g11_spec')).toBe(true);
    expect(spec.data.isSpectator).toBe(false);
    expect((await getRoomSeats(kv, roomCode)).some(s => s?.userId === 'g11_spec')).toBe(true);
    expect((await getRoomSpectators(kv, roomCode)).some(s => s.userId === 'g11_spec')).toBe(false);
  });
});

describe('terminal state after driver-played winning cards', () => {
  it('announces a player winning action and acknowledges its commit when the game projection fails', async () => {
    const owner = await fake.connect('t_projection_winner', 'ProjectionWinner');
    const loser = await fake.connect('t_projection_loser', 'ProjectionLoser');
    const roomCode = await createWaitingRoom(owner, loser);
    await readyAndStart(owner, [loser]);
    handlers.turnTimer.stop(roomCode);

    const winning = makeCard('number', 'red', { value: 7, id: 'projection_win_card' });
    const session = GameSession.fromState(
      makeGameState({
        currentPlayerIndex: 0,
        currentColor: 'red',
        players: [
          makePlayer('t_projection_winner', [winning]),
          makePlayer('t_projection_loser', [makeCard('number', 'blue', { value: 2 })]),
        ],
      }),
    );
    handlers.sessions.set(roomCode, session);

    const originalIn = fake.io.in.bind(fake.io);
    let injected = false;
    vi.spyOn(fake.io, 'in').mockImplementation(((target: string) => {
      const roomView = originalIn(target);
      if (target !== roomCode || injected) return roomView;
      injected = true;
      return {
        ...roomView,
        fetchSockets: async () => {
          throw new Error('injected winning action projection failure');
        },
      };
    }) as typeof fake.io.in);

    await expect(owner.call('game:play_card', { cardId: winning.id })).resolves.toMatchObject({ success: true });
    expect(injected).toBe(true);
    expect(session.getFullState().phase).toBe('round_end');
    expect(fake.roomEmits(roomCode, 'game:round_end')).toHaveLength(1);
    expect(handlers.turnTimer.isRunning(roomCode)).toBe(false);
  });

  it('arms the next turn after a non-terminal committed action even when projection fails', async () => {
    const owner = await fake.connect('t_projection_turn_owner', 'ProjectionTurnOwner');
    const loser = await fake.connect('t_projection_turn_loser', 'ProjectionTurnLoser');
    const roomCode = await createWaitingRoom(owner, loser);
    await readyAndStart(owner, [loser]);
    handlers.turnTimer.stop(roomCode);

    const played = makeCard('number', 'red', { value: 7, id: 'projection_turn_card' });
    const session = GameSession.fromState(
      makeGameState({
        currentPlayerIndex: 0,
        currentColor: 'red',
        players: [
          makePlayer('t_projection_turn_owner', [played, makeCard('number', 'green', { value: 3 })]),
          makePlayer('t_projection_turn_loser', [makeCard('number', 'blue', { value: 2 })]),
        ],
      }),
    );
    handlers.sessions.set(roomCode, session);

    const originalIn = fake.io.in.bind(fake.io);
    let injected = false;
    vi.spyOn(fake.io, 'in').mockImplementation(((target: string) => {
      const roomView = originalIn(target);
      if (target !== roomCode || injected) return roomView;
      injected = true;
      return {
        ...roomView,
        fetchSockets: async () => {
          throw new Error('injected next-turn projection failure');
        },
      };
    }) as typeof fake.io.in);

    await expect(owner.call('game:play_card', { cardId: played.id })).resolves.toMatchObject({ success: true });
    expect(injected).toBe(true);
    expect(session.getFullState().phase).toBe('playing');
    expect(handlers.turnTimer.isRunning(roomCode)).toBe(true);
    handlers.turnTimer.stop(roomCode);
  });

  it('finishes a one-shot autopilot winning action when its intermediate projection fails', async () => {
    const owner = await fake.connect('t_once_projection_owner', 'OnceProjectionOwner');
    const loser = await fake.connect('t_once_projection_loser', 'OnceProjectionLoser');
    const roomCode = await createWaitingRoom(owner, loser);
    await readyAndStart(owner, [loser]);
    handlers.turnTimer.stop(roomCode);

    const winning = makeCard('number', 'red', { value: 4, id: 'once_projection_win' });
    const session = GameSession.fromState(
      makeGameState({
        currentPlayerIndex: 0,
        currentColor: 'red',
        players: [
          makePlayer('t_once_projection_owner', [winning]),
          makePlayer('t_once_projection_loser', [makeCard('number', 'blue', { value: 6 })]),
        ],
      }),
    );
    handlers.sessions.set(roomCode, session);

    const originalIn = fake.io.in.bind(fake.io);
    let injected = false;
    vi.spyOn(fake.io, 'in').mockImplementation(((target: string) => {
      const roomView = originalIn(target);
      if (target !== roomCode || injected) return roomView;
      injected = true;
      return {
        ...roomView,
        fetchSockets: async () => {
          throw new Error('injected one-shot autopilot projection failure');
        },
      };
    }) as typeof fake.io.in);

    await expect(owner.call('game:autopilot_once')).resolves.toMatchObject({ success: true });
    expect(injected).toBe(true);
    expect(session.getFullState().phase).toBe('round_end');
    expect(fake.roomEmits(roomCode, 'game:round_end')).toHaveLength(1);
  });

  it('an autopilot winning play emits game:round_end; only the offline player is auto-voted', async () => {
    vi.useFakeTimers();
    const roomCode = 'TERMFIX';
    const winning = makeCard('number', 'red', { value: 5, id: 'win_card' });
    const state = makeGameState({
      phase: 'playing',
      currentPlayerIndex: 0,
      currentColor: 'red',
      players: [
        // Connected human on manual autopilot: plays for them, but must NOT
        // consent to the next round on their behalf.
        { ...makePlayer('t_winner', [winning]), autopilot: true },
        { ...makePlayer('t_loser', [makeCard('number', 'blue', { value: 9 })]), autopilot: true, connected: false },
      ],
    });
    const session = GameSession.fromState(state);
    handlers.sessions.set(roomCode, session);

    const originalIn = fake.io.in.bind(fake.io);
    let injected = false;
    vi.spyOn(fake.io, 'in').mockImplementation(((target: string) => {
      const roomView = originalIn(target);
      if (target !== roomCode || injected) return roomView;
      injected = true;
      return {
        ...roomView,
        fetchSockets: async () => {
          throw new Error('injected autopilot winning projection failure');
        },
      };
    }) as typeof fake.io.in);

    // The 1s immediate-autopilot driver plays the winning card; before the
    // fix this path skipped emitTerminalStateIfNeeded entirely, so the room
    // soft-locked in round_end with no terminal event and no auto-votes.
    startTurnTimer(fake.io, kv, roomCode, session, handlers.turnTimer, handlers.sessions, handlers.persister);
    await vi.advanceTimersByTimeAsync(1_500);

    expect(session.getFullState().phase).toBe('round_end');
    expect(injected).toBe(true);
    expect(fake.roomEmits(roomCode, 'game:round_end').length).toBeGreaterThan(0);
    const vote = fake.lastRoomEmit(roomCode, 'game:next_round_vote') as {
      votes: number;
      required: number;
      voters: string[];
    };
    expect(vote.votes).toBe(1);
    expect(vote.required).toBe(2);
    expect(vote.voters).toContain('t_loser');
    expect(vote.voters).not.toContain('t_winner');

    handlers.sessions.delete(roomCode);
  });
});

describe('round_end vote bookkeeping', () => {
  it('eliminated humans are not counted as required voters', () => {
    const state = makeGameState({
      phase: 'round_end',
      players: [makePlayer('e1'), makePlayer('e2'), { ...makePlayer('e3'), eliminated: true }],
    });
    const session = GameSession.fromState(state);
    const vote = getRoundEndVoteState('ELIMTEST', session)!;
    expect(vote.required).toBe(2);
  });

  it('a reconnecting player loses the auto-vote their disconnect earned', async () => {
    const owner = await fake.connect('g12_owner', 'Owner12');
    const dropper = await fake.connect('g12_drop', 'Dropper12');
    const roomCode = await createWaitingRoom(owner, dropper);
    await readyAndStart(owner, [dropper]);

    // Jump to round_end, then replay the disconnect → auto-vote flow.
    const roundEnd = makeGameState({
      phase: 'round_end',
      players: [makePlayer('g12_owner'), makePlayer('g12_drop')],
    });
    handlers.sessions.set(roomCode, GameSession.fromState(roundEnd));

    await dropper.trigger('disconnect');
    let vote = fake.lastRoomEmit(roomCode, 'game:next_round_vote') as { votes: number; voters: string[] };
    expect(vote.voters).toContain('g12_drop');

    const back = await fake.connect('g12_drop', 'Dropper12');
    expect((await back.call('room:rejoin', roomCode)).success).toBe(true);
    vote = fake.lastRoomEmit(roomCode, 'game:next_round_vote') as { votes: number; voters: string[] };
    expect(vote.voters).not.toContain('g12_drop');
    expect(vote.votes).toBe(0);
  });

  it('dissolveRoom drops vote state so a reused room code starts clean', async () => {
    const roomCode = 'REUSE1';
    const state = makeGameState({
      phase: 'round_end',
      players: [makePlayer('d1'), { ...makePlayer('d2'), connected: false }],
    });
    const session = GameSession.fromState(state);
    reseedTerminalVotes(fake.io, roomCode, session);
    expect(getRoundEndVoteState(roomCode, session)!.votes).toBe(1);

    await dissolveRoom(
      fake.io,
      kv,
      roomCode,
      handlers.sessions,
      handlers.turnTimer,
      handlers.persister,
      'empty',
      handlers.voiceChannels,
      handlers.cleanupRoomRuntime,
    );
    expect(getRoundEndVoteState(roomCode, session)!.votes).toBe(0);
  });

  it('a session restored after a restart reseeds auto-votes and the cooldown anchor', async () => {
    const owner = await fake.connect('g8_owner', 'Owner8');
    const away = await fake.connect('g8_away', 'Away8');
    const roomCode = await createWaitingRoom(owner, away);
    await readyAndStart(owner, [away]);

    // Simulate a restart mid round_end: in-memory session, votes and the
    // round-end timestamp are gone; the snapshot has both players offline.
    const persisted = makeGameState({
      phase: 'round_end',
      players: [
        { ...makePlayer('g8_owner'), connected: false },
        { ...makePlayer('g8_away'), connected: false },
      ],
    });
    await saveGameState(kv, roomCode, persisted);
    handlers.sessions.delete(roomCode);

    const res = await owner.call('room:rejoin', roomCode);
    expect(res.success).toBe(true);

    // Reseed auto-voted both offline players, then the owner's own rejoin
    // revoked their vote — being back means the next round needs their click.
    const vote = fake.lastRoomEmit(roomCode, 'game:next_round_vote') as {
      votes: number;
      required: number;
      voters: string[];
    };
    expect(vote).toBeDefined();
    expect(vote.votes).toBe(1);
    expect(vote.required).toBe(2);
    expect(vote.voters).toContain('g8_away');
    expect(vote.voters).not.toContain('g8_owner');

    // First click is the owner's own vote (completes the count)…
    const voteClick = await owner.call('game:next_round');
    expect(voteClick.success).toBe(true);
    expect(voteClick.started).not.toBe(true);
    // …and the immediate second click hits the reseeded cooldown anchor
    // instead of starting the round.
    const advance = await owner.call('game:next_round');
    expect(advance.success).toBe(true);
    expect(advance.started).not.toBe(true);
  });
});

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import { setupSocketHandlers } from '../../src/ws/socket-handler';
import { emitTerminalStateIfNeeded, getRoundEndVoteState, getRoundEndAt } from '../../src/ws/game-events';
import {
  getRoom, getRoomSeats, getRoomSpectators, takeSeat, addSpectatorToRoom,
  pickNextOwner, markAllMembersDisconnected, createRoom,
} from '../../src/plugins/core/room/store';
import { saveGameState, loadGameState, GameStatePersister } from '../../src/plugins/core/game/state-store';
import { GameSession } from '../../src/plugins/core/game/session';
import { rearmBlitzAfterRestore, enforceBlitzDeadline } from '../../src/ws/room-events';
import { cancelOwnerTransfer } from '../../src/ws/owner-transfer';
import type { MumbleIceConfig } from '../../src/config';
import { makeFakeIo, type FakeSocket } from '../helpers/fake-io';
import { makeGameState, makePlayer } from '../helpers/test-utils';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';

// Regressions for the 2026-07 lifecycle audit fixes: restart reconciliation,
// all-disconnect grace, TOCTOU start/next-round guards, terminal-state
// idempotency, orphaned-session writes, owner-transfer fallback.

const kv = new MemoryKvStore();
const fake = makeFakeIo();
const mumbleIce: MumbleIceConfig = {
  enabled: false, host: '', port: 0, serverId: 1, parentChannelId: 0, channelNamePrefix: 'test',
};
const handlers = setupSocketHandlers(fake.io, kv, 'test-secret', 60_000, mumbleIce);

afterAll(() => {
  handlers.turnTimer.stopAll();
});

afterEach(() => {
  vi.useRealTimers();
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

describe('restart recovery reconciliation', () => {
  it('ghost connected:true players from a crashed process are auto-voted after restore', async () => {
    const owner = await fake.connect('f1_owner', 'F1Owner');
    const ghost = await fake.connect('f1_ghost', 'F1Ghost');
    const roomCode = await createWaitingRoom(owner, ghost);
    await readyAndStart(owner, [ghost]);

    // Crash mid round_end: the snapshot froze BOTH players as connected:true
    // even though no socket survives a restart. Before the fix the ghost was
    // never auto-voted (connected:true skips the reseed) and could never
    // disconnect — the vote deadlocked at 1/2 forever.
    const persisted = makeGameState({
      phase: 'round_end',
      players: [makePlayer('f1_owner'), makePlayer('f1_ghost')],
    });
    await saveGameState(kv, roomCode, persisted);
    handlers.sessions.delete(roomCode);

    const res = await owner.call('room:rejoin', roomCode);
    expect(res.success).toBe(true);

    const vote = fake.lastRoomEmit(roomCode, 'game:next_round_vote') as { votes: number; required: number; voters: string[] };
    expect(vote.voters).toContain('f1_ghost');
    expect(vote.voters).not.toContain('f1_owner');
  });

  it('a restored game whose snapshot points at an offline player still gets a turn driver', async () => {
    const owner = await fake.connect('f2_owner', 'F2Owner');
    const away = await fake.connect('f2_away', 'F2Away');
    const roomCode = await createWaitingRoom(owner, away);
    await readyAndStart(owner, [away]);

    // Crash while it was the (now offline) opponent's turn. Before the fix
    // the rejoin gated startTurnTimer on connectedCount >= 2, so a pure
    // two-human game froze forever — nobody could act, no timer, no driver.
    const persisted = makeGameState({
      phase: 'playing',
      currentPlayerIndex: 1,
      players: [makePlayer('f2_owner'), { ...makePlayer('f2_away'), connected: false }],
    });
    await saveGameState(kv, roomCode, persisted);
    handlers.sessions.delete(roomCode);
    handlers.turnTimer.stop(roomCode);

    expect((await owner.call('room:rejoin', roomCode)).success).toBe(true);
    expect(handlers.turnTimer.isRunning(roomCode)).toBe(true);

    handlers.turnTimer.stop(roomCode);
    handlers.sessions.delete(roomCode);
  });

  it('markAllMembersDisconnected resets human flags but spares bots and live users', async () => {
    const roomCode = 'RECON1';
    await createRoom(kv, roomCode, 'r_owner', {
      turnTimeLimit: 30, targetScore: 500, houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true, spectatorMode: 'hidden',
    });
    await takeSeat(kv, roomCode, 0, { userId: 'r_owner', nickname: 'O', avatarUrl: null, ready: true, connected: true, role: 'normal', isBot: false });
    await takeSeat(kv, roomCode, 1, { userId: 'r_bot', nickname: 'B', avatarUrl: null, ready: true, connected: true, role: 'normal', isBot: true });
    await takeSeat(kv, roomCode, 2, { userId: 'r_live', nickname: 'L', avatarUrl: null, ready: true, connected: true, role: 'normal', isBot: false });
    await addSpectatorToRoom(kv, roomCode, { userId: 'r_spec', nickname: 'S', avatarUrl: null, role: 'normal', connected: true });

    await markAllMembersDisconnected(kv, roomCode, (uid) => uid === 'r_live');

    const seats = await getRoomSeats(kv, roomCode);
    const ownerSeat = seats.find(s => s?.userId === 'r_owner')!;
    expect(ownerSeat.connected).toBe(false);
    expect(ownerSeat.ready).toBe(false);
    // Bots have no socket to lose; live users already reconnected.
    expect(seats.find(s => s?.userId === 'r_bot')!.connected).toBe(true);
    expect(seats.find(s => s?.userId === 'r_live')!.connected).toBe(true);

    const spec = (await getRoomSpectators(kv, roomCode)).find(s => s.userId === 'r_spec')!;
    expect(spec.connected).toBe(false);
    // Without disconnectedAt the sweep's staleness filter never matches and
    // the ghost spectator lives forever.
    expect(spec.disconnectedAt).toBeDefined();
  });
});

describe('review-pass regressions', () => {
  it('a terminal snapshot restored by a non-owner schedules an owner transfer', async () => {
    const owner = await fake.connect('f6_owner', 'F6Owner');
    const other = await fake.connect('f6_other', 'F6Other');
    const roomCode = await createWaitingRoom(owner, other);
    await readyAndStart(owner, [other]);

    const persisted = makeGameState({
      phase: 'round_end',
      players: [makePlayer('f6_owner'), makePlayer('f6_other')],
    });
    await saveGameState(kv, roomCode, persisted);
    handlers.sessions.delete(roomCode);

    // The owner never returns. Every exit from the scoreboard is
    // owner-gated, so without a scheduled transfer the room deadlocks.
    expect((await other.call('room:rejoin', roomCode)).success).toBe(true);
    expect(fake.lastRoomEmit(roomCode, 'room:owner_transfer_pending')).toBeDefined();
    cancelOwnerTransfer(roomCode);
  });

  it('a restored blitz game recovers its total-time deadline', async () => {
    vi.useFakeTimers();
    const roomCode = 'BLITZR1';
    await createRoom(kv, roomCode, 'b_a', {
      turnTimeLimit: 30, targetScore: 500, houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true, spectatorMode: 'hidden',
    });
    const state = makeGameState({
      phase: 'round_end',
      gameStartedAt: Date.now() - 3600_000,
      players: [makePlayer('b_a'), makePlayer('b_b')],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, blitzTimeLimit: 60 } },
    });
    const session = GameSession.fromState(state);
    handlers.sessions.set(roomCode, session);

    rearmBlitzAfterRestore(fake.io, kv, roomCode, session, handlers.sessions, handlers.turnTimer, handlers.persister);
    // Deadline expired an hour ago — the next round boundary must end the
    // game instead of dealing a round that should never exist.
    const ended = await enforceBlitzDeadline(fake.io, kv, roomCode, session, handlers.turnTimer, handlers.persister);
    expect(ended).toBe(true);
    expect(session.getFullState().phase).toBe('game_over');
    handlers.sessions.delete(roomCode);
  });

  it('a blitz force-game-over with an offline owner schedules an owner transfer', async () => {
    vi.useFakeTimers();
    const roomCode = 'BLITZOWN';
    await createRoom(kv, roomCode, 'bo_owner', {
      turnTimeLimit: 30, targetScore: 500, houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true, spectatorMode: 'hidden',
    });
    const state = makeGameState({
      phase: 'round_end',
      gameStartedAt: Date.now() - 3600_000,
      players: [{ ...makePlayer('bo_owner'), connected: false }, makePlayer('bo_other')],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, blitzTimeLimit: 60 } },
    });
    const session = GameSession.fromState(state);
    handlers.sessions.set(roomCode, session);
    rearmBlitzAfterRestore(fake.io, kv, roomCode, session, handlers.sessions, handlers.turnTimer, handlers.persister);

    expect(await enforceBlitzDeadline(fake.io, kv, roomCode, session, handlers.turnTimer, handlers.persister)).toBe(true);
    // Without this the game_over scoreboard is owner-gated forever: the
    // anchor short-circuits the live path's owner check.
    expect(fake.lastRoomEmit(roomCode, 'room:owner_transfer_pending')).toBeDefined();
    cancelOwnerTransfer(roomCode);
    handlers.sessions.delete(roomCode);
  });

  it('remove_bot force-game-over stamps the terminal anchor and finished status', async () => {
    const owner = await fake.connect('f7_owner', 'F7Owner');
    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;
    const added = await owner.call('room:add_bot', { difficulty: 'easy' });
    expect(added.success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('game:start')).success).toBe(true);

    const botId = handlers.sessions.get(roomCode)!.getFullState().players.find(p => p.id !== 'f7_owner')!.id;
    expect((await owner.call('room:remove_bot', { botId })).success).toBe(true);

    // game:over announced outside emitTerminalStateIfNeeded must still do
    // its bookkeeping — otherwise rejoin replay has no anchor and the lobby
    // keeps listing a "playing" room.
    expect(getRoundEndAt(roomCode)).not.toBeNull();
    expect((await getRoom(kv, roomCode))!.status).toBe('finished');
    handlers.turnTimer.stop(roomCode);
  });

  it('getRoom reports a partial poison hash as nonexistent instead of throwing', async () => {
    // The shape a bare hset (e.g. setRoomOwner racing dissolveRoom) leaves
    // behind: ownerId present, settings missing.
    await kv.hset('room:POISON1', { ownerId: 'ghost' });
    await expect(getRoom(kv, 'POISON1')).resolves.toBeNull();
    await kv.del('room:POISON1');
  });
});

describe('all-disconnect grace (5 minutes, not 30 seconds)', () => {
  it('a game where every human dropped survives the 30s per-player timers', async () => {
    vi.useFakeTimers();
    const owner = await fake.connect('f3_owner', 'F3Owner');
    const other = await fake.connect('f3_other', 'F3Other');
    const roomCode = await createWaitingRoom(owner, other);
    await readyAndStart(owner, [other]);

    await owner.trigger('disconnect');
    await other.trigger('disconnect');

    // t+31s: both 30s reconnect windows expired. Before the fix the first
    // window's callback saw "no connected humans" and dissolved on the spot,
    // capping the 5-minute all-disconnect grace at ~30s.
    await vi.advanceTimersByTimeAsync(31_000);
    expect(await getRoom(kv, roomCode)).not.toBeNull();
    expect(handlers.sessions.has(roomCode)).toBe(true);

    // The grace is a bound, not immortality: the 5-minute timer still fires.
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(await getRoom(kv, roomCode)).toBeNull();
    expect(handlers.sessions.has(roomCode)).toBe(false);
  });
});

describe('game:start concurrency lock', () => {
  it('two interleaved game:start events deal exactly one game', async () => {
    const owner = await fake.connect('f4_owner', 'F4Owner');
    const other = await fake.connect('f4_other', 'F4Other');
    const roomCode = await createWaitingRoom(owner, other);
    for (const s of [other, owner]) expect((await s.call('room:ready', true)).success).toBe(true);

    // Both handlers pass the status/sessions checks before either reaches
    // sessions.set — only the synchronous startingRooms entry separates them.
    const [r1, r2] = await Promise.all([
      owner.call('game:start'),
      owner.call('game:start'),
    ]);
    const successes = [r1, r2].filter(r => r.success);
    expect(successes.length).toBe(1);
    expect([r1, r2].find(r => !r.success)!.error).toBe('游戏已开始');
    // One deck dealt: every socket saw exactly one game:state.
    expect(owner.emitted.filter(e => e.event === 'game:state').length).toBe(1);
    expect(other.emitted.filter(e => e.event === 'game:state').length).toBe(1);
  });
});

describe('seat:take race keeps the loser a spectator', () => {
  it('losing a seat race must not strip spectator membership', async () => {
    const owner = await fake.connect('f5_owner', 'F5Owner');
    const other = await fake.connect('f5_other', 'F5Other');
    const roomCode = await createWaitingRoom(owner, other);

    const specA = await fake.connect('f5_specA', 'F5SpecA');
    const specB = await fake.connect('f5_specB', 'F5SpecB');
    expect((await specA.call('room:join', roomCode)).success).toBe(true);
    expect((await specB.call('room:join', roomCode)).success).toBe(true);

    const [rA, rB] = await Promise.all([
      specA.call('seat:take', 3),
      specB.call('seat:take', 3),
    ]);
    const winners = [rA, rB].filter(r => r.success);
    expect(winners.length).toBe(1);

    const loser = rA.success ? specB : specA;
    const loserId = loser.data.user.userId;
    const seats = await getRoomSeats(kv, roomCode);
    const spectators = await getRoomSpectators(kv, roomCode);
    // Before the fix the loser was removed from spectators BEFORE takeSeat
    // threw, leaving them with neither identity — invisible and permanently
    // rejected by the "你不在该房间中" precheck. (data.isSpectator is an
    // in-game-only flag and stays false in waiting rooms for everyone.)
    expect(seats.some(s => s?.userId === loserId)).toBe(false);
    expect(spectators.some(s => s.userId === loserId)).toBe(true);
  });
});

describe('terminal-state idempotency and orphan guard', () => {
  it('a second emitTerminalStateIfNeeded pass neither re-broadcasts nor moves the anchor', async () => {
    const roomCode = 'IDEM1';
    const state = makeGameState({
      phase: 'round_end',
      players: [makePlayer('i_a'), { ...makePlayer('i_b'), connected: false }],
    });
    const session = GameSession.fromState(state);
    handlers.sessions.set(roomCode, session);

    const first = await emitTerminalStateIfNeeded(fake.io, roomCode, session, handlers.turnTimer, kv, handlers.sessions, handlers.persister);
    expect(first).toBe(true);
    const anchor = getRoundEndAt(roomCode);
    const votesAfterFirst = getRoundEndVoteState(roomCode, session)!.votes;
    expect(votesAfterFirst).toBe(1);
    const broadcasts = fake.roomEmits(roomCode, 'game:round_end').length;

    await new Promise(r => setTimeout(r, 5));
    const second = await emitTerminalStateIfNeeded(fake.io, roomCode, session, handlers.turnTimer, kv, handlers.sessions, handlers.persister);
    expect(second).toBe(true);
    expect(getRoundEndAt(roomCode)).toBe(anchor);
    expect(getRoundEndVoteState(roomCode, session)!.votes).toBe(votesAfterFirst);
    expect(fake.roomEmits(roomCode, 'game:round_end').length).toBe(broadcasts);

    handlers.sessions.delete(roomCode);
  });

  it('an orphaned session (room dissolved mid-callback) announces nothing', async () => {
    const roomCode = 'ORPHAN1';
    const state = makeGameState({
      phase: 'round_end',
      players: [makePlayer('o_a'), makePlayer('o_b')],
    });
    const session = GameSession.fromState(state);
    // Deliberately NOT in handlers.sessions — the room was dissolved while a
    // timer callback still held this reference.
    const handled = await emitTerminalStateIfNeeded(fake.io, roomCode, session, handlers.turnTimer, kv, handlers.sessions, handlers.persister);
    expect(handled).toBe(true);
    expect(fake.roomEmits(roomCode, 'game:round_end').length).toBe(0);
    expect(getRoundEndAt(roomCode)).toBeNull();
  });
});

describe('persister tombstone', () => {
  it('markDirty after cleanup cannot resurrect a dissolved room state', async () => {
    const store = new MemoryKvStore();
    const persister = new GameStatePersister(store);
    const state = makeGameState({});

    persister.markDirty('TOMB1', state);
    await persister.flushNow('TOMB1');
    expect(await loadGameState(store, 'TOMB1')).not.toBeNull();

    await store.del('game:TOMB1:state');
    persister.cleanup('TOMB1');
    // The zombie write a timer callback issues after dissolveRoom.
    persister.markDirty('TOMB1', state);
    await persister.flushNow('TOMB1');
    expect(await loadGameState(store, 'TOMB1')).toBeNull();

    // A new game on a reused code lifts the tombstone.
    persister.revive('TOMB1');
    persister.markDirty('TOMB1', state);
    await persister.flushNow('TOMB1');
    expect(await loadGameState(store, 'TOMB1')).not.toBeNull();
  });
});

describe('owner transfer fallback', () => {
  it('falls back to a disconnected human instead of leaving ownerId dangling', () => {
    const seats = [
      null,
      { userId: 'grace_user', nickname: 'G', avatarUrl: null, ready: false, connected: false, role: 'normal', isBot: false },
      { userId: 'a_bot', nickname: 'B', avatarUrl: null, ready: true, connected: true, role: 'normal', isBot: true },
      null, null, null, null, null,
    ];
    // Everyone human is inside a disconnect grace window; before the fix this
    // returned null and the room kept a dangling ownerId — unmanageable until
    // the idle sweep.
    expect(pickNextOwner(seats as never, [], 'leaving_owner')).toBe('grace_user');
  });
});

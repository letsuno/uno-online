import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import { setupSocketHandlers } from '../../src/ws/socket-handler';
import { dissolveRoom } from '../../src/ws/room-lifecycle';
import { getRoundEndVoteState, reseedTerminalVotes } from '../../src/ws/game-events';
import {
  getRoomSeats, getRoomSpectators, getUserRoom, findNextOwner, setRoomStatus,
} from '../../src/plugins/core/room/store';
import { saveGameState } from '../../src/plugins/core/game/state-store';
import { GameSession } from '../../src/plugins/core/game/session';
import type { MumbleIceConfig } from '../../src/config';
import { makeFakeIo, type FakeSocket } from '../helpers/fake-io';
import { makeGameState, makePlayer, makeCard } from '../helpers/test-utils';
import { startTurnTimer } from '../../src/ws/room-events';

// Ghost-state regressions: stale user:room mappings, cross-room rejoin,
// orphaned seats/timers, vote deadlocks. Each test replays the user-visible
// trigger sequence through the real setupSocketHandlers stack.

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

describe('cross-room rejoin guard', () => {
  it('rejects rejoin into another room while still a member elsewhere', async () => {
    const ownerX = await fake.connect('g1_ownerX', 'OwnerX');
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
  it('clears user:room so the kicked player is not auto-bounced back in', async () => {
    const owner = await fake.connect('g4_owner', 'Owner4');
    const target = await fake.connect('g4_target', 'Target4');
    const roomCode = await createWaitingRoom(owner, target);

    await target.trigger('disconnect');
    expect((await owner.call('room:kick', { targetId: 'g4_target' })).success).toBe(true);

    expect(await getUserRoom(kv, 'g4_target')).toBeNull();

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

describe('reconnection no longer cancels foreign cleanup timers', () => {
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

  it('multi-tab: a second connection kicks the first socket cleanly', async () => {
    const first = await fake.connect('g10_dup', 'Dup10');
    await fake.connect('g10_dup', 'Dup10');
    expect(first.lastEmit('auth:kicked')).toBeDefined();
  });
});

describe('in-game leave keeps seat connectivity honest', () => {
  it('seat connected=false after leave, and owner transfer skips the departed', async () => {
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

    expect((await leaver.call('room:leave')).success).toBe(true);

    const seat = (await getRoomSeats(kv, roomCode)).find(s => s?.userId === 'g6_leaver');
    expect(seat?.connected).toBe(false);
    expect(await findNextOwner(kv, roomCode, 'g6_owner')).toBe('g6_stayer');
  });
});

describe('rejoin denial releases the reverse mapping', () => {
  it('a member orphaned by back_to_room is not locked out of the app', async () => {
    const owner = await fake.connect('g7_owner', 'Owner7');
    const orphan = await fake.connect('g7_orphan', 'Orphan7');
    const filler = await fake.connect('g7_filler', 'Filler7');

    const created = await owner.call('room:create', { allowSpectators: false });
    const roomCode = created.roomCode as string;
    expect((await orphan.call('room:join', roomCode)).success).toBe(true);
    expect((await orphan.call('seat:take', 1)).success).toBe(true);
    expect((await filler.call('room:join', roomCode)).success).toBe(true);
    await readyAndStart(owner, [orphan]);

    // Orphan drops mid-game; the match ends; everyone returns to the room
    // without them; a fresh game starts without them.
    await orphan.trigger('disconnect');
    handlers.sessions.get(roomCode)!.forceGameOver('g7_owner');
    expect((await owner.call('game:back_to_room')).success).toBe(true);
    expect(await getUserRoom(kv, 'g7_orphan')).toBe(roomCode);

    expect((await owner.call('seat:take', 0)).success).toBe(true);
    expect((await filler.call('seat:take', 1)).success).toBe(true);
    await readyAndStart(owner, [filler]);

    // The orphan comes back: no seat, not a spectator, spectating disallowed.
    const orphanBack = await fake.connect('g7_orphan', 'Orphan7');
    const denied = await orphanBack.call('room:rejoin', roomCode);
    expect(denied.success).toBe(false);
    expect(denied.error).toBe('无法观战该房间');

    // The fix: denial released the mapping, so they can play elsewhere.
    expect(await getUserRoom(kv, 'g7_orphan')).toBeNull();
    expect((await orphanBack.call('room:create', {})).success).toBe(true);
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
    expect(joined.isSpectator).toBe(true);

    const queued = await spec.call('game:spectator_join');
    expect(queued.success).toBe(true);
    expect(queued.queued).toBe(true);

    // Jump the live session to round_end deterministically.
    const roundEnd = makeGameState({
      phase: 'round_end',
      players: [makePlayer('g11_owner'), makePlayer('g11_p2')],
    });
    handlers.sessions.set(roomCode, GameSession.fromState(roundEnd));

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

    // The 1s immediate-autopilot driver plays the winning card; before the
    // fix this path skipped emitTerminalStateIfNeeded entirely, so the room
    // soft-locked in round_end with no terminal event and no auto-votes.
    startTurnTimer(fake.io, kv, roomCode, session, handlers.turnTimer, handlers.sessions, handlers.persister);
    await vi.advanceTimersByTimeAsync(1_500);

    expect(session.getFullState().phase).toBe('round_end');
    expect(fake.roomEmits(roomCode, 'game:round_end').length).toBeGreaterThan(0);
    const vote = fake.lastRoomEmit(roomCode, 'game:next_round_vote') as { votes: number; required: number; voters: string[] };
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
      players: [
        makePlayer('e1'),
        makePlayer('e2'),
        { ...makePlayer('e3'), eliminated: true },
      ],
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

    await dissolveRoom(fake.io, kv, roomCode, handlers.sessions, handlers.turnTimer, handlers.persister, 'empty');
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
    const vote = fake.lastRoomEmit(roomCode, 'game:next_round_vote') as { votes: number; required: number; voters: string[] };
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

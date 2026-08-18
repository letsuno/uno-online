import { afterAll, describe, expect, it } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import { setupSocketHandlers } from '../../src/ws/socket-handler';
import { GameSession } from '../../src/plugins/core/game/session';
import { loadGameState } from '../../src/plugins/core/game/state-store';
import {
  getRoom,
  getRoomSeats,
  getRoomSpectators,
  getUserRoom,
  replaceRosterWithSpectators,
  setRoomOwner,
  setRoomStatus,
} from '../../src/plugins/core/room/store';
import {
  clearPendingSpectatorJoins,
  getPendingSpectatorQueue,
  getRoundEndVoteState,
  markTerminalHandled,
} from '../../src/ws/game-events';
import { clearNextRoundExclusions, isNextRoundExcluded } from '../../src/plugins/core/game/lifecycle-state';
import { getDepartedMemberIds } from '../../src/ws/room-departure';
import type { MumbleIceConfig } from '../../src/config';
import { makeFakeIo, type FakeSocket } from '../helpers/fake-io';

// Drives the real setupSocketHandlers stack (room/seat/game handlers, KV state)
// with in-memory sockets, so tests replay full user flows: create → join →
// seat → start → game over → back to room → re-seat → start again.

// ─── Setup ────────────────────────────────────────────────────────────────────

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

function spectatorNames(payload: unknown): string[] {
  return (payload as { spectators: Array<{ nickname: string }> }).spectators.map(s => s.nickname).sort();
}

/** create room via owner socket, join+seat+ready the given players, and start. */
async function startGame(owner: FakeSocket, seated: Array<{ socket: FakeSocket; seat: number }>): Promise<string> {
  const created = await owner.call('room:create', {});
  expect(created.success).toBe(true);
  const roomCode = created.roomCode as string;
  for (const { socket, seat } of seated) {
    expect((await socket.call('room:join', roomCode)).success).toBe(true);
    expect((await socket.call('seat:take', seat)).success).toBe(true);
    expect((await socket.call('room:ready', true)).success).toBe(true);
  }
  expect((await owner.call('room:ready', true)).success).toBe(true);
  const started = await owner.call('game:start');
  expect(started.success).toBe(true);
  return roomCode;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('spectator list lifecycle across a full match cycle', () => {
  it('re-broadcasts the real spectator snapshot when a game starts', async () => {
    const owner = await fake.connect('u_owner', 'Owner');
    const p2 = await fake.connect('u_p2', 'PlayerTwo');
    const spec = await fake.connect('u_spec', 'Watcher');

    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;
    expect((await p2.call('room:join', roomCode)).success).toBe(true);
    expect((await p2.call('seat:take', 1)).success).toBe(true);
    expect((await spec.call('room:join', roomCode)).success).toBe(true);
    expect(spec.data.isSpectator).toBe(true);
    expect((await p2.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('game:start')).success).toBe(true);

    // Game 1: the unseated member is the only spectator in the snapshot.
    expect(spectatorNames(fake.lastRoomEmit(roomCode, 'room:spectator_list'))).toEqual(['Watcher']);
    expect(spec.data.isSpectator).toBe(true);
    expect(owner.data.isSpectator).toBe(false);

    // Match ends (target score reached) → owner sends everyone back to the room.
    handlers.sessions.get(roomCode)!.forceGameOver('u_owner');
    markTerminalHandled(roomCode, Date.now() - 10_001);
    expect((await owner.call('game:back_to_room')).success).toBe(true);

    // Back in the waiting room the model is "everyone unseated = spectator".
    expect(spectatorNames(fake.lastRoomEmit(roomCode, 'room:spectator_list'))).toEqual([
      'Owner',
      'PlayerTwo',
      'Watcher',
    ]);
    expect((await getRoomSeats(kv, roomCode)).every(s => s === null)).toBe(true);
    expect((await getRoom(kv, roomCode))!.status).toBe('waiting');

    // Re-seat a different pair (owner + former watcher); PlayerTwo stays out.
    expect((await owner.call('seat:take', 0)).success).toBe(true);
    expect((await spec.call('seat:take', 1)).success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);
    expect((await spec.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('game:start')).success).toBe(true);

    // Regression: game 2 must broadcast only the real spectator, not the
    // stale "everyone" list left over from game:back_to_room.
    expect(spectatorNames(fake.lastRoomEmit(roomCode, 'room:spectator_list'))).toEqual(['PlayerTwo']);
    expect(p2.data.isSpectator).toBe(true);
    expect(owner.data.isSpectator).toBe(false);
    expect(spec.data.isSpectator).toBe(false);
    expect((p2.lastEmit('game:state') as { viewerId: string }).viewerId).toBe('__spectator__');
  });

  it('lets outsiders rejoin as spectators while the game-over scoreboard is up', async () => {
    const owner = await fake.connect('u_owner2', 'Owner2');
    const p2 = await fake.connect('u_p2b', 'PlayerTwoB');
    const roomCode = await startGame(owner, [{ socket: p2, seat: 1 }]);

    handlers.sessions.get(roomCode)!.forceGameOver('u_owner2');
    await setRoomStatus(kv, roomCode, 'finished');

    const watcher = await fake.connect('u_late', 'LateWatcher');
    const res = await watcher.call('room:rejoin', roomCode);
    expect(res.success).toBe(true);
    expect(res.mode).toBe('spectator');
    expect(res.gameState.phase).toBe('game_over');
  });

  it('lets a member spectator reconnect even when allowSpectators is off, but keeps outsiders out', async () => {
    const owner = await fake.connect('u_owner3', 'Owner3');
    const p2 = await fake.connect('u_p2c', 'PlayerTwoC');
    const spec = await fake.connect('u_spec3', 'MemberWatcher');

    const created = await owner.call('room:create', { allowSpectators: false });
    const roomCode = created.roomCode as string;
    expect((await p2.call('room:join', roomCode)).success).toBe(true);
    expect((await p2.call('seat:take', 1)).success).toBe(true);
    expect((await spec.call('room:join', roomCode)).success).toBe(true);
    expect((await p2.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('game:start')).success).toBe(true);
    expect(spec.data.isSpectator).toBe(true);

    // Member spectator drops and comes back on a fresh socket.
    await spec.trigger('disconnect');
    const specAgain = await fake.connect('u_spec3', 'MemberWatcher');
    const res = await specAgain.call('room:rejoin', roomCode);
    expect(res.success).toBe(true);
    expect(res.mode).toBe('spectator');

    // A stranger still cannot spectate a no-spectators room.
    const outsider = await fake.connect('u_out3', 'Outsider');
    const denied = await outsider.call('room:rejoin', roomCode);
    expect(denied.success).toBe(false);
    expect(denied.error).toBe('无法观战该房间');
  });

  it('broadcasts the spectator list when a spectator disconnects mid-game', async () => {
    const owner = await fake.connect('u_owner4', 'Owner4');
    const p2 = await fake.connect('u_p2d', 'PlayerTwoD');
    const spec = await fake.connect('u_spec4', 'DroppingWatcher');

    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;
    expect((await p2.call('room:join', roomCode)).success).toBe(true);
    expect((await p2.call('seat:take', 1)).success).toBe(true);
    expect((await spec.call('room:join', roomCode)).success).toBe(true);
    expect((await p2.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('game:start')).success).toBe(true);

    await spec.trigger('disconnect');

    const payload = fake.lastRoomEmit(roomCode, 'room:spectator_list') as {
      spectators: Array<{ nickname: string; connected: boolean }>;
    };
    const dropped = payload.spectators.find(s => s.nickname === 'DroppingWatcher');
    expect(dropped).toBeDefined();
    expect(dropped!.connected).toBe(false);
  });

  it('broadcasts spectator departure when the owner kicks a spectator on the scoreboard', async () => {
    const owner = await fake.connect('u_owner5', 'Owner5');
    const p2 = await fake.connect('u_p2e', 'PlayerTwoE');
    const spec = await fake.connect('u_spec5', 'KickedWatcher');

    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;
    expect((await p2.call('room:join', roomCode)).success).toBe(true);
    expect((await p2.call('seat:take', 1)).success).toBe(true);
    expect((await spec.call('room:join', roomCode)).success).toBe(true);
    expect((await p2.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('game:start')).success).toBe(true);

    handlers.sessions.get(roomCode)!.forceGameOver('u_owner5');
    await setRoomStatus(kv, roomCode, 'finished');

    const res = await owner.call('room:kick', { targetId: 'u_spec5' });
    expect(res.success).toBe(true);
    expect(fake.lastRoomEmit('user:u_spec5', 'room:membership_ended')).toEqual({
      roomCode,
      reason: 'kicked',
    });
    expect(await getRoomSpectators(kv, roomCode)).toEqual([]);
    expect(spectatorNames(fake.lastRoomEmit(roomCode, 'room:spectator_list'))).toEqual([]);
    const left = fake.lastRoomEmit(roomCode, 'room:spectator_left') as { nickname: string };
    expect(left.nickname).toBe('KickedWatcher');
  });

  it('lets a spectator owner free a full seat and queue for the next round', async () => {
    const owner = await fake.connect('u_full_owner', 'FullOwner');
    const watcher = await fake.connect('u_full_watcher', 'FullWatcher');

    const created = await owner.call('room:create', {});
    const roomCode = created.roomCode as string;
    expect((await watcher.call('room:join', roomCode)).success).toBe(true);

    for (let i = 0; i < 9; i++) {
      expect((await owner.call('room:add_bot', { difficulty: 'easy' })).success).toBe(true);
    }
    expect((await owner.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('game:start')).success).toBe(true);
    expect(watcher.data.isSpectator).toBe(true);

    const activeSession = handlers.sessions.get(roomCode)!;
    handlers.sessions.set(
      roomCode,
      GameSession.fromState({
        ...activeSession.getFullState(),
        phase: 'round_end',
      }),
    );
    markTerminalHandled(roomCode, Date.now());
    await setRoomOwner(kv, roomCode, 'u_full_watcher');

    const fullJoin = await watcher.call('game:spectator_join');
    expect(fullJoin.success).toBe(false);
    expect(fullJoin.error).toContain('人数已达上限');

    const botId = handlers.sessions
      .get(roomCode)!
      .getFullState()
      .players.find(p => p.isBot)!.id;
    const kicked = await watcher.call('game:kick_player', { targetId: botId });
    expect(kicked.success).toBe(true);
    expect(handlers.sessions.get(roomCode)!.getPlayerCount()).toBe(9);

    const queued = await watcher.call('game:spectator_join');
    expect(queued).toMatchObject({ success: true, queued: true });
    expect(getPendingSpectatorQueue(roomCode)).toContainEqual({
      userId: 'u_full_watcher',
      nickname: 'FullWatcher',
    });
    handlers.turnTimer.stop(roomCode);
  });

  it('does not record a spectator owner vote before they join the next-round queue', async () => {
    const owner = await fake.connect('u_vote_guard_owner', 'VoteGuardOwner');
    const second = await fake.connect('u_vote_guard_second', 'VoteGuardSecond');
    const third = await fake.connect('u_vote_guard_third', 'VoteGuardThird');
    const roomCode = await startGame(owner, [
      { socket: second, seat: 1 },
      { socket: third, seat: 2 },
    ]);

    const playing = handlers.sessions.get(roomCode)!.getFullState();
    handlers.sessions.set(roomCode, GameSession.fromState({ ...playing, phase: 'round_end' }));
    markTerminalHandled(roomCode, Date.now() - 10_001);
    await setRoomOwner(kv, roomCode, 'u_vote_guard_second');
    expect(await owner.call('game:leave_to_spectate')).toMatchObject({ success: true });
    await setRoomOwner(kv, roomCode, 'u_vote_guard_owner');

    expect(await second.call('game:next_round')).toMatchObject({ success: true, started: false });
    expect(await third.call('game:next_round')).toMatchObject({ success: true, started: false });

    const rejected = await owner.call('game:next_round');
    expect(rejected).toMatchObject({ success: false });
    expect(getRoundEndVoteState(roomCode, handlers.sessions.get(roomCode)!)!.voters).not.toContain(
      'u_vote_guard_owner',
    );

    expect(await owner.call('game:spectator_join')).toMatchObject({ success: true, queued: true });
    // First valid click records the owner's confirmation; only a subsequent
    // click may exercise the owner's explicit start control.
    expect(await owner.call('game:next_round')).toMatchObject({ success: true, started: false });
    expect(await owner.call('game:next_round')).toMatchObject({ success: true, started: true });
    handlers.turnTimer.stop(roomCode);
  });

  it('moves an offline human to the spectator roster and excludes them from the next round', async () => {
    const owner = await fake.connect('u_kick_owner', 'KickOwner');
    const target = await fake.connect('u_kick_target', 'KickTarget');
    const third = await fake.connect('u_kick_third', 'KickThird');
    const roomCode = await startGame(owner, [
      { socket: target, seat: 1 },
      { socket: third, seat: 2 },
    ]);

    const playing = handlers.sessions.get(roomCode)!.getFullState();
    handlers.sessions.set(roomCode, GameSession.fromState({ ...playing, phase: 'round_end' }));
    markTerminalHandled(roomCode, Date.now());
    await target.trigger('disconnect');

    expect((await owner.call('game:kick_player', { targetId: 'u_kick_target' })).success).toBe(true);
    expect(isNextRoundExcluded(roomCode, 'u_kick_target')).toBe(true);
    expect(
      handlers.sessions
        .get(roomCode)!
        .getFullState()
        .players.some(player => player.id === 'u_kick_target'),
    ).toBe(false);
    expect((await getRoomSeats(kv, roomCode)).some(seat => seat?.userId === 'u_kick_target')).toBe(false);
    expect(
      (await getRoomSpectators(kv, roomCode)).find(spectator => spectator.userId === 'u_kick_target'),
    ).toMatchObject({ connected: false });
    expect(await getUserRoom(kv, 'u_kick_target')).toBe(roomCode);
    expect(fake.lastRoomEmit('user:u_kick_target', 'room:membership_ended')).toBeUndefined();

    // Simulate a process restart: both the live session and module registry
    // disappear, while the versioned KV snapshot remains authoritative.
    const persisted = JSON.parse((await kv.get(`game:${roomCode}:state`))!);
    expect(persisted.lifecycle.excludedFromNextRound).toContain('u_kick_target');
    handlers.sessions.delete(roomCode);
    clearNextRoundExclusions(roomCode);
    expect(isNextRoundExcluded(roomCode, 'u_kick_target')).toBe(false);

    const targetBack = await fake.connect('u_kick_target', 'KickTarget');
    const rejoined = await targetBack.call('room:rejoin', roomCode);
    expect(rejoined).toMatchObject({
      success: true,
      mode: 'spectator',
      room: { ownerId: 'u_kick_owner' },
    });
    expect(
      (await getRoomSpectators(kv, roomCode)).find(spectator => spectator.userId === 'u_kick_target'),
    ).toMatchObject({ connected: true });
    expect(isNextRoundExcluded(roomCode, 'u_kick_target')).toBe(true);
    await expect(targetBack.call('game:spectator_join')).resolves.toMatchObject({
      success: false,
      error: '你已被房主移出下一回合',
    });

    handlers.sessions.get(roomCode)!.forceGameOver('u_kick_owner');
    await setRoomStatus(kv, roomCode, 'finished');
    expect((await owner.call('game:kick_player', { targetId: 'u_kick_third' })).success).toBe(false);
    await expect(owner.call('room:kick', { targetId: 'u_kick_third' })).resolves.toMatchObject({
      success: false,
      error: '结算中的对局玩家只能通过计分板移至观战席',
    });
    handlers.turnTimer.stop(roomCode);
  });

  it('notifies a connected suspended player through their private user room when moved to spectators', async () => {
    const owner = await fake.connect('u_suspend_kick_owner', 'SuspendOwner');
    const target = await fake.connect('u_suspend_kick_target', 'SuspendTarget');
    const third = await fake.connect('u_suspend_kick_third', 'SuspendThird');
    const roomCode = await startGame(owner, [
      { socket: target, seat: 1 },
      { socket: third, seat: 2 },
    ]);

    expect(await target.call('room:leave')).toMatchObject({ success: true, outcome: 'suspended' });
    expect(target.rooms.has(`user:u_suspend_kick_target`)).toBe(true);
    expect(target.rooms.has(roomCode)).toBe(false);

    const suspendedState = handlers.sessions.get(roomCode)!.getFullState();
    handlers.sessions.set(roomCode, GameSession.fromState({ ...suspendedState, phase: 'round_end' }));
    markTerminalHandled(roomCode, Date.now());

    expect((await owner.call('game:kick_player', { targetId: 'u_suspend_kick_target' })).success).toBe(true);
    expect(fake.lastRoomEmit(`user:u_suspend_kick_target`, 'room:moved_to_spectator')).toMatchObject({
      roomCode,
      reason: '你已被房主移至观战席',
    });
    expect(
      (await getRoomSpectators(kv, roomCode)).find(spectator => spectator.userId === 'u_suspend_kick_target'),
    ).toMatchObject({ connected: false });
    expect(await getDepartedMemberIds(kv, roomCode)).toContain('u_suspend_kick_target');
    expect(fake.lastRoomEmit(`user:u_suspend_kick_target`, 'room:membership_ended')).toBeUndefined();

    const targetBack = await fake.connect('u_suspend_kick_target', 'SuspendTarget');
    expect(await targetBack.call('room:rejoin', roomCode)).toMatchObject({
      success: true,
      mode: 'spectator',
    });
    expect(await getDepartedMemberIds(kv, roomCode)).not.toContain('u_suspend_kick_target');
  });

  it('restores pending next-round spectator intent from the durable game snapshot', async () => {
    const owner = await fake.connect('u_queue_restore_owner', 'QueueOwner');
    const player = await fake.connect('u_queue_restore_player', 'QueuePlayer');
    const watcher = await fake.connect('u_queue_restore_watcher', 'QueueWatcher');
    const roomCode = await startGame(owner, [{ socket: player, seat: 1 }]);
    expect((await watcher.call('room:rejoin', roomCode)).success).toBe(true);

    const playing = handlers.sessions.get(roomCode)!.getFullState();
    handlers.sessions.set(roomCode, GameSession.fromState({ ...playing, phase: 'round_end' }));
    markTerminalHandled(roomCode, Date.now());
    expect(await watcher.call('game:spectator_join')).toMatchObject({
      success: true,
      queued: true,
    });

    const persisted = JSON.parse((await kv.get(`game:${roomCode}:state`))!);
    expect(persisted.lifecycle.pendingSpectatorJoins).toContainEqual(
      expect.objectContaining({
        userId: 'u_queue_restore_watcher',
        nickname: 'QueueWatcher',
      }),
    );

    clearPendingSpectatorJoins(roomCode);
    handlers.sessions.delete(roomCode);
    expect(getPendingSpectatorQueue(roomCode)).toEqual([]);

    expect((await owner.call('room:rejoin', roomCode)).success).toBe(true);
    expect(getPendingSpectatorQueue(roomCode)).toEqual([
      {
        userId: 'u_queue_restore_watcher',
        nickname: 'QueueWatcher',
      },
    ]);
    expect(owner.lastEmit('game:spectator_queue')).toMatchObject({
      queue: [{ userId: 'u_queue_restore_watcher', nickname: 'QueueWatcher' }],
    });
    handlers.turnTimer.stop(roomCode);
  });

  it('keeps a suspended scoreboard target departed until the remaining humans explicitly leave', async () => {
    const owner = await fake.connect('u_depart_kick_owner', 'DepartOwner');
    const target = await fake.connect('u_depart_kick_target', 'DepartTarget');
    const third = await fake.connect('u_depart_kick_third', 'DepartThird');
    const roomCode = await startGame(owner, [
      { socket: target, seat: 1 },
      { socket: third, seat: 2 },
    ]);

    expect(await target.call('room:leave')).toMatchObject({ success: true, outcome: 'suspended' });
    const state = handlers.sessions.get(roomCode)!.getFullState();
    handlers.sessions.set(roomCode, GameSession.fromState({ ...state, phase: 'round_end' }));
    markTerminalHandled(roomCode, Date.now());
    expect(await owner.call('game:kick_player', { targetId: 'u_depart_kick_target' })).toMatchObject({ success: true });
    expect(await getDepartedMemberIds(kv, roomCode)).toContain('u_depart_kick_target');

    expect(await owner.call('room:leave')).toMatchObject({ success: true, outcome: 'suspended' });
    expect(await third.call('room:leave')).toMatchObject({ success: true, outcome: 'dissolved' });
    expect(await getRoom(kv, roomCode)).toBeNull();
  });

  it('rejects scoreboard mutations until the terminal announcement is committed', async () => {
    const owner = await fake.connect('u_anchor_owner', 'AnchorOwner');
    const target = await fake.connect('u_anchor_target', 'AnchorTarget');
    const third = await fake.connect('u_anchor_third', 'AnchorThird');
    const roomCode = await startGame(owner, [
      { socket: target, seat: 1 },
      { socket: third, seat: 2 },
    ]);
    const playing = handlers.sessions.get(roomCode)!.getFullState();
    handlers.sessions.set(roomCode, GameSession.fromState({ ...playing, phase: 'round_end' }));

    await expect(target.call('game:next_round')).resolves.toMatchObject({
      success: false,
      error: '回合仍在结算中',
    });
    await expect(owner.call('game:kick_player', { targetId: 'u_anchor_target' })).resolves.toMatchObject({
      success: false,
      error: '回合仍在结算中',
    });
    await expect(target.call('game:leave_to_spectate')).resolves.toMatchObject({
      success: false,
      error: '回合仍在结算中',
    });
    expect(
      handlers.sessions
        .get(roomCode)!
        .getFullState()
        .players.some(player => player.id === 'u_anchor_target'),
    ).toBe(true);
    expect(target.data.isSpectator).toBe(false);
    handlers.turnTimer.stop(roomCode);
  });

  it('serializes an online kick with join requests and consumes the exclusion after one round', async () => {
    const owner = await fake.connect('u_race_owner', 'RaceOwner');
    const target = await fake.connect('u_race_target', 'RaceTarget');
    const third = await fake.connect('u_race_third', 'RaceThird');
    const roomCode = await startGame(owner, [
      { socket: target, seat: 1 },
      { socket: third, seat: 2 },
    ]);
    const playing = handlers.sessions.get(roomCode)!.getFullState();
    handlers.sessions.set(roomCode, GameSession.fromState({ ...playing, phase: 'round_end' }));
    markTerminalHandled(roomCode, Date.now());

    const originalBatchStrings = kv.batchStrings.bind(kv);
    let signalRosterWrite!: () => void;
    let releaseRosterWrite!: () => void;
    const rosterWriteStarted = new Promise<void>(resolve => {
      signalRosterWrite = resolve;
    });
    const rosterWriteGate = new Promise<void>(resolve => {
      releaseRosterWrite = resolve;
    });
    let shouldBlockRosterWrite = true;
    kv.batchStrings = async operations => {
      if (shouldBlockRosterWrite && operations.some(operation => operation.key === `room:${roomCode}:spectators`)) {
        shouldBlockRosterWrite = false;
        signalRosterWrite();
        await rosterWriteGate;
      }
      await originalBatchStrings(operations);
    };

    try {
      const kick = owner.call('game:kick_player', { targetId: 'u_race_target' });
      await rosterWriteStarted;

      let joinSettled = false;
      const join = target.call('game:spectator_join').then(result => {
        joinSettled = true;
        return result;
      });
      await Promise.resolve();
      expect(joinSettled).toBe(false);

      releaseRosterWrite();
      await expect(kick).resolves.toMatchObject({ success: true });
      await expect(join).resolves.toMatchObject({
        success: false,
        error: '你已被房主移出下一回合',
      });
    } finally {
      kv.batchStrings = originalBatchStrings;
      releaseRosterWrite!();
    }

    expect(getPendingSpectatorQueue(roomCode).some(spectator => spectator.userId === 'u_race_target')).toBe(false);
    expect(isNextRoundExcluded(roomCode, 'u_race_target')).toBe(true);

    // Both remaining humans consent; the owner's second click starts the
    // round. The exclusion is then consumed and may not leak into N+2.
    markTerminalHandled(roomCode, Date.now() - 10_001);
    await expect(third.call('game:next_round')).resolves.toMatchObject({ success: true, started: false });
    await expect(owner.call('game:next_round')).resolves.toMatchObject({ success: true, started: false });
    await expect(owner.call('game:next_round')).resolves.toMatchObject({ success: true, started: true });
    expect(handlers.sessions.get(roomCode)!.getFullState().phase).toBe('playing');
    expect(isNextRoundExcluded(roomCode, 'u_race_target')).toBe(false);
    await expect(target.call('game:spectator_join')).resolves.toMatchObject({
      success: true,
      queued: true,
    });
    handlers.turnTimer.stop(roomCode);
  });

  it('does not let scoreboard removals resume after the next round has started', async () => {
    const owner = await fake.connect('u_transition_owner', 'TransitionOwner');
    const target = await fake.connect('u_transition_target', 'TransitionTarget');
    const third = await fake.connect('u_transition_third', 'TransitionThird');
    const watcher = await fake.connect('u_transition_watcher', 'TransitionWatcher');
    const roomCode = await startGame(owner, [
      { socket: target, seat: 1 },
      { socket: third, seat: 2 },
    ]);
    expect(await watcher.call('room:rejoin', roomCode)).toMatchObject({
      success: true,
      mode: 'spectator',
    });

    const playing = handlers.sessions.get(roomCode)!.getFullState();
    handlers.sessions.set(roomCode, GameSession.fromState({ ...playing, phase: 'round_end' }));
    expect(await watcher.call('game:spectator_join')).toMatchObject({ success: true, queued: true });
    markTerminalHandled(roomCode, Date.now() - 10_001);
    await third.call('game:next_round');
    await target.call('game:next_round');
    await owner.call('game:next_round');

    const originalGet = kv.get.bind(kv);
    let signalSeatRead!: () => void;
    let releaseSeatRead!: () => void;
    const seatReadStarted = new Promise<void>(resolve => {
      signalSeatRead = resolve;
    });
    const seatReadGate = new Promise<void>(resolve => {
      releaseSeatRead = resolve;
    });
    let shouldBlockSeatRead = true;
    kv.get = async (key: string) => {
      if (shouldBlockSeatRead && key === `room:${roomCode}:seats`) {
        shouldBlockSeatRead = false;
        signalSeatRead();
        await seatReadGate;
      }
      return originalGet(key);
    };

    try {
      const start = owner.call('game:next_round');
      await seatReadStarted;
      const kick = owner.call('game:kick_player', { targetId: 'u_transition_target' });
      const leave = target.call('game:leave_to_spectate');
      releaseSeatRead();

      await expect(start).resolves.toMatchObject({ success: true, started: true });
      await expect(kick).resolves.toMatchObject({ success: false });
      await expect(leave).resolves.toMatchObject({ success: false });
    } finally {
      kv.get = originalGet;
      releaseSeatRead!();
    }

    const nextRound = handlers.sessions.get(roomCode)!.getFullState();
    expect(nextRound.phase).toBe('playing');
    expect(nextRound.players.some(player => player.id === 'u_transition_target')).toBe(true);
    expect(target.data.isSpectator).toBe(false);
    handlers.turnTimer.stop(roomCode);
  });

  it('rolls back a scoreboard kick when the roster commit fails and allows retry', async () => {
    const owner = await fake.connect('u_fault_kick_owner', 'FaultOwner');
    const target = await fake.connect('u_fault_kick_target', 'FaultTarget');
    const third = await fake.connect('u_fault_kick_third', 'FaultThird');
    const roomCode = await startGame(owner, [
      { socket: target, seat: 1 },
      { socket: third, seat: 2 },
    ]);
    const playing = handlers.sessions.get(roomCode)!.getFullState();
    handlers.sessions.set(roomCode, GameSession.fromState({ ...playing, phase: 'round_end' }));
    markTerminalHandled(roomCode, Date.now() - 11_000);

    const originalBatchStrings = kv.batchStrings.bind(kv);
    let failOnce = true;
    kv.batchStrings = async operations => {
      if (failOnce && operations.some(operation => operation.key === `room:${roomCode}:spectators`)) {
        failOnce = false;
        throw new Error('injected roster failure');
      }
      await originalBatchStrings(operations);
    };
    try {
      expect(await owner.call('game:kick_player', { targetId: 'u_fault_kick_target' })).toMatchObject({
        success: false,
        error: '调整玩家失败，请重试',
      });
      expect(
        handlers.sessions
          .get(roomCode)!
          .getFullState()
          .players.some(player => player.id === 'u_fault_kick_target'),
      ).toBe(true);
      expect((await getRoomSeats(kv, roomCode)).some(seat => seat?.userId === 'u_fault_kick_target')).toBe(true);
      expect(
        (await getRoomSpectators(kv, roomCode)).some(spectator => spectator.userId === 'u_fault_kick_target'),
      ).toBe(false);
      expect(isNextRoundExcluded(roomCode, 'u_fault_kick_target')).toBe(false);

      expect(await owner.call('game:kick_player', { targetId: 'u_fault_kick_target' })).toMatchObject({
        success: true,
      });
    } finally {
      kv.batchStrings = originalBatchStrings;
    }
  });

  it('rolls back self-spectating when the roster commit fails and allows retry', async () => {
    const owner = await fake.connect('u_fault_leave_owner', 'FaultLeaveOwner');
    const target = await fake.connect('u_fault_leave_target', 'FaultLeaveTarget');
    const third = await fake.connect('u_fault_leave_third', 'FaultLeaveThird');
    const roomCode = await startGame(owner, [
      { socket: target, seat: 1 },
      { socket: third, seat: 2 },
    ]);
    const playing = handlers.sessions.get(roomCode)!.getFullState();
    handlers.sessions.set(roomCode, GameSession.fromState({ ...playing, phase: 'round_end' }));
    markTerminalHandled(roomCode, Date.now() - 11_000);

    const originalBatchStrings = kv.batchStrings.bind(kv);
    let failOnce = true;
    kv.batchStrings = async operations => {
      if (failOnce && operations.some(operation => operation.key === `room:${roomCode}:spectators`)) {
        failOnce = false;
        throw new Error('injected roster failure');
      }
      await originalBatchStrings(operations);
    };
    try {
      expect(await target.call('game:leave_to_spectate')).toMatchObject({
        success: false,
        error: '切换观战失败，请重试',
      });
      expect(target.data.isSpectator).toBe(false);
      expect(
        handlers.sessions
          .get(roomCode)!
          .getFullState()
          .players.some(player => player.id === 'u_fault_leave_target'),
      ).toBe(true);
      expect((await getRoomSeats(kv, roomCode)).some(seat => seat?.userId === 'u_fault_leave_target')).toBe(true);

      expect(await target.call('game:leave_to_spectate')).toMatchObject({ success: true });
    } finally {
      kv.batchStrings = originalBatchStrings;
    }
  });

  it('rolls back a failed pending promotion and can start the round on retry', async () => {
    const owner = await fake.connect('u_fault_round_owner', 'FaultRoundOwner');
    const player = await fake.connect('u_fault_round_player', 'FaultRoundPlayer');
    const watcher = await fake.connect('u_fault_round_watcher', 'FaultRoundWatcher');
    const roomCode = await startGame(owner, [{ socket: player, seat: 1 }]);
    expect((await watcher.call('room:rejoin', roomCode)).success).toBe(true);
    const playing = handlers.sessions.get(roomCode)!.getFullState();
    handlers.sessions.set(roomCode, GameSession.fromState({ ...playing, phase: 'round_end' }));
    markTerminalHandled(roomCode, Date.now() - 11_000);
    expect(await watcher.call('game:spectator_join')).toMatchObject({ success: true, queued: true });

    const originalBatchStrings = kv.batchStrings.bind(kv);
    let failOnce = true;
    kv.batchStrings = async operations => {
      if (failOnce && operations.some(operation => operation.key === `room:${roomCode}:spectators`)) {
        failOnce = false;
        throw new Error('injected promotion failure');
      }
      await originalBatchStrings(operations);
    };
    try {
      const attempts = [];
      for (const voter of [player, owner, owner]) {
        attempts.push(await voter.call('game:next_round'));
        if (!failOnce) break;
      }
      expect(failOnce).toBe(false);
      expect(attempts.at(-1)).toMatchObject({ success: true, started: false });
      expect(handlers.sessions.get(roomCode)!.getFullState().phase).toBe('round_end');
      expect(getPendingSpectatorQueue(roomCode)).toContainEqual({
        userId: 'u_fault_round_watcher',
        nickname: 'FaultRoundWatcher',
      });
      expect(
        (await getRoomSpectators(kv, roomCode)).some(spectator => spectator.userId === 'u_fault_round_watcher'),
      ).toBe(true);

      let retry = await owner.call('game:next_round');
      if (!retry.started) retry = await owner.call('game:next_round');
      expect(retry).toMatchObject({ success: true, started: true });
      expect(handlers.sessions.get(roomCode)!.getFullState().phase).toBe('playing');
    } finally {
      kv.batchStrings = originalBatchStrings;
    }
  });

  it('makes rejoin wait for back-to-room cleanup and never restores the retired snapshot', async () => {
    const owner = await fake.connect('u_back_owner', 'BackOwner');
    const player = await fake.connect('u_back_player', 'BackPlayer');
    const roomCode = await startGame(owner, [{ socket: player, seat: 1 }]);
    const session = handlers.sessions.get(roomCode)!;
    session.forceGameOver('u_back_owner');
    markTerminalHandled(roomCode, Date.now() - 10_001);
    await setRoomStatus(kv, roomCode, 'finished');
    await player.trigger('disconnect');

    const originalGet = kv.get.bind(kv);
    const originalSet = kv.set.bind(kv);
    let signalBackRead!: () => void;
    let signalSnapshotWrite!: () => void;
    let releaseSnapshotWrite!: () => void;
    const backRead = new Promise<void>(resolve => {
      signalBackRead = resolve;
    });
    const snapshotWriteStarted = new Promise<void>(resolve => {
      signalSnapshotWrite = resolve;
    });
    const snapshotWriteGate = new Promise<void>(resolve => {
      releaseSnapshotWrite = resolve;
    });
    let shouldSignalBackRead = true;
    let shouldBlockSnapshotWrite = true;
    kv.get = async (key: string) => {
      if (shouldSignalBackRead && key === `room:${roomCode}:spectators`) {
        shouldSignalBackRead = false;
        signalBackRead();
      }
      return originalGet(key);
    };
    kv.set = async (key: string, value: string, ttlSeconds?: number) => {
      if (shouldBlockSnapshotWrite && key === `game:${roomCode}:state`) {
        shouldBlockSnapshotWrite = false;
        signalSnapshotWrite();
        await snapshotWriteGate;
      }
      await originalSet(key, value, ttlSeconds);
    };

    try {
      session.addChatMessage({
        id: 'cleanup-barrier',
        userId: 'u_back_owner',
        nickname: 'BackOwner',
        text: 'dirty',
        timestamp: Date.now(),
      });
      handlers.persister.markDirty(roomCode, session.getFullState());
      const flush = handlers.persister.flushNow(roomCode);
      await snapshotWriteStarted;

      const back = owner.call('game:back_to_room');
      await backRead;
      const playerBack = await fake.connect('u_back_player', 'BackPlayer');
      let rejoinSettled = false;
      const rejoin = playerBack.call('room:rejoin', roomCode).then(result => {
        rejoinSettled = true;
        return result;
      });
      await Promise.resolve();
      expect(rejoinSettled).toBe(false);

      releaseSnapshotWrite();
      await flush;
      await expect(back).resolves.toMatchObject({ success: true });
      await expect(rejoin).resolves.toMatchObject({ success: true });
      expect(playerBack.data.isSpectator).toBe(true);
    } finally {
      kv.get = originalGet;
      kv.set = originalSet;
      releaseSnapshotWrite!();
    }

    expect((await getRoom(kv, roomCode))!.status).toBe('waiting');
    expect(handlers.sessions.has(roomCode)).toBe(false);
    expect(await loadGameState(kv, roomCode)).toBeNull();
  });

  it('keeps the committed back-to-room transition successful when a post-commit roster read fails', async () => {
    const owner = await fake.connect('u_projection_owner', 'ProjectionOwner');
    const player = await fake.connect('u_projection_player', 'ProjectionPlayer');
    const lobbyViewer = await fake.connect('u_projection_lobby', 'ProjectionLobby');
    const roomCode = await startGame(owner, [{ socket: player, seat: 1 }]);
    const session = handlers.sessions.get(roomCode)!;
    session.forceGameOver('u_projection_owner');
    markTerminalHandled(roomCode, Date.now() - 10_001);
    await setRoomStatus(kv, roomCode, 'finished');

    const originalGet = kv.get.bind(kv);
    let spectatorReads = 0;
    kv.get = async (key: string) => {
      if (key === `room:${roomCode}:spectators`) {
        spectatorReads += 1;
        // First read captures the rollback anchor. The second belongs to the
        // post-commit game:back_to_room payload; the independent spectator
        // and lobby projections must still run after it fails.
        if (spectatorReads === 2) throw new Error('injected post-commit roster read failure');
      }
      return originalGet(key);
    };

    let result: Record<string, unknown> = {};
    try {
      result = await owner.call('game:back_to_room');
      expect(result).toMatchObject({ success: true });
    } finally {
      kv.get = originalGet;
    }

    expect((await getRoom(kv, roomCode))!.status).toBe('waiting');
    expect(handlers.sessions.has(roomCode)).toBe(false);
    expect(await loadGameState(kv, roomCode)).toBeNull();
    expect(owner.data.isSpectator).toBe(true);
    expect(player.data.isSpectator).toBe(true);
    expect(result).toMatchObject({
      room: { status: 'waiting' },
      spectators: expect.arrayContaining([
        expect.objectContaining({ userId: 'u_projection_owner' }),
        expect.objectContaining({ userId: 'u_projection_player' }),
      ]),
    });
    expect(fake.lastRoomEmit(roomCode, 'game:back_to_room')).toMatchObject({
      room: { status: 'waiting' },
      spectators: expect.arrayContaining([
        expect.objectContaining({ userId: 'u_projection_owner' }),
        expect.objectContaining({ userId: 'u_projection_player' }),
      ]),
    });
    expect(spectatorNames(fake.lastRoomEmit(roomCode, 'room:spectator_list'))).toEqual([
      'ProjectionOwner',
      'ProjectionPlayer',
    ]);
    expect(
      (lobbyViewer.lastEmit('lobby:rooms') as Array<{ roomCode: string }>).some(room => room.roomCode === roomCode),
    ).toBe(false);
  });

  it('rolls back waiting status and roster when terminal snapshot deletion fails', async () => {
    const owner = await fake.connect('u_rollback_owner', 'RollbackOwner');
    const player = await fake.connect('u_rollback_player', 'RollbackPlayer');
    const roomCode = await startGame(owner, [{ socket: player, seat: 1 }]);
    const session = handlers.sessions.get(roomCode)!;
    session.forceGameOver('u_rollback_owner');
    markTerminalHandled(roomCode, Date.now() - 10_001);
    await setRoomStatus(kv, roomCode, 'finished');
    const seatsBefore = await getRoomSeats(kv, roomCode);

    const originalDel = kv.del.bind(kv);
    let failSnapshotDelete = true;
    kv.del = async (...keys: string[]) => {
      if (failSnapshotDelete && keys.includes(`game:${roomCode}:state`)) {
        failSnapshotDelete = false;
        throw new Error('injected snapshot delete failure');
      }
      await originalDel(...keys);
    };

    try {
      await expect(owner.call('game:back_to_room')).resolves.toMatchObject({
        success: false,
        error: '返回房间失败，请重试',
      });
    } finally {
      kv.del = originalDel;
    }

    expect((await getRoom(kv, roomCode))!.status).toBe('finished');
    expect(await getRoomSeats(kv, roomCode)).toEqual(seatsBefore);
    expect(await getRoomSpectators(kv, roomCode)).toEqual([]);
    expect(handlers.sessions.get(roomCode)).toBe(session);
    expect((await loadGameState(kv, roomCode))!.phase).toBe('game_over');
    handlers.turnTimer.stop(roomCode);
  });

  it('ignores a stale terminal snapshot once waiting status was durably committed', async () => {
    const owner = await fake.connect('u_crash_owner', 'CrashOwner');
    const player = await fake.connect('u_crash_player', 'CrashPlayer');
    const roomCode = await startGame(owner, [{ socket: player, seat: 1 }]);
    await player.trigger('disconnect');

    const session = handlers.sessions.get(roomCode)!;
    session.forceGameOver('u_crash_owner');
    handlers.persister.markDirty(roomCode, session.getFullState());
    await handlers.persister.flushNow(roomCode);
    await replaceRosterWithSpectators(kv, roomCode, [
      {
        userId: 'u_crash_owner',
        nickname: 'CrashOwner',
        avatarUrl: null,
        role: 'normal',
        connected: true,
      },
      {
        userId: 'u_crash_player',
        nickname: 'CrashPlayer',
        avatarUrl: null,
        role: 'normal',
        connected: false,
      },
    ]);

    // Simulate a crash after the waiting commit marker but before
    // deleteGameState. The new process has no live session.
    await setRoomStatus(kv, roomCode, 'waiting');
    handlers.sessions.delete(roomCode);
    expect(await loadGameState(kv, roomCode)).not.toBeNull();

    const playerBack = await fake.connect('u_crash_player', 'CrashPlayer');
    const rejoined = await playerBack.call('room:rejoin', roomCode);
    expect(rejoined.success).toBe(true);
    expect(rejoined.gameState).toBeUndefined();
    expect(playerBack.data.isSpectator).toBe(true);
    expect(handlers.sessions.has(roomCode)).toBe(false);
    expect((await getRoom(kv, roomCode))!.status).toBe('waiting');
    handlers.turnTimer.stop(roomCode);
  });
});

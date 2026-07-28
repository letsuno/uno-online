import { afterAll, describe, expect, it } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import { setupSocketHandlers } from '../../src/ws/socket-handler';
import { GameSession } from '../../src/plugins/core/game/session';
import {
  getRoom,
  getRoomSeats,
  getRoomSpectators,
  setRoomOwner,
  setRoomStatus,
} from '../../src/plugins/core/room/store';
import { getPendingSpectatorQueue } from '../../src/ws/game-events';
import type { MumbleIceConfig } from '../../src/config';
import { makeFakeIo, type FakeSocket } from '../helpers/fake-io';

// Drives the real setupSocketHandlers stack (room/seat/game handlers, KV state)
// with in-memory sockets, so tests replay full user flows: create → join →
// seat → start → game over → back to room → re-seat → start again.

// ─── Setup ────────────────────────────────────────────────────────────────────

const kv = new MemoryKvStore();
const fake = makeFakeIo();
const mumbleIce: MumbleIceConfig = {
  enabled: false, host: '', port: 0, serverId: 1, parentChannelId: 0, channelNamePrefix: 'test',
};
const handlers = setupSocketHandlers(fake.io, kv, 'test-secret', 60_000, mumbleIce);

afterAll(() => {
  handlers.turnTimer.stopAll();
});

function spectatorNames(payload: unknown): string[] {
  return ((payload as { spectators: Array<{ nickname: string }> }).spectators).map(s => s.nickname).sort();
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
    expect((await p2.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('room:ready', true)).success).toBe(true);
    expect((await owner.call('game:start')).success).toBe(true);

    // Game 1: the unseated member is the only spectator in the snapshot.
    expect(spectatorNames(fake.lastRoomEmit(roomCode, 'room:spectator_list'))).toEqual(['Watcher']);
    expect(spec.data.isSpectator).toBe(true);
    expect(owner.data.isSpectator).toBe(false);

    // Match ends (target score reached) → owner sends everyone back to the room.
    handlers.sessions.get(roomCode)!.forceGameOver('u_owner');
    expect((await owner.call('game:back_to_room')).success).toBe(true);

    // Back in the waiting room the model is "everyone unseated = spectator".
    expect(spectatorNames(fake.lastRoomEmit(roomCode, 'room:spectator_list')))
      .toEqual(['Owner', 'PlayerTwo', 'Watcher']);
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
    expect(res.isSpectator).toBe(true);
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
    expect(res.isSpectator).toBe(true);

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
    handlers.sessions.set(roomCode, GameSession.fromState({
      ...activeSession.getFullState(),
      phase: 'round_end',
    }));
    await setRoomOwner(kv, roomCode, 'u_full_watcher');

    const fullJoin = await watcher.call('game:spectator_join');
    expect(fullJoin.success).toBe(false);
    expect(fullJoin.error).toContain('人数已达上限');

    const botId = handlers.sessions.get(roomCode)!.getFullState().players.find(p => p.isBot)!.id;
    const kicked = await watcher.call('game:kick_player', { targetId: botId });
    expect(kicked.success).toBe(true);
    expect(handlers.sessions.get(roomCode)!.getPlayerCount()).toBe(9);

    const queued = await watcher.call('game:spectator_join');
    expect(queued).toMatchObject({ success: true, queued: true });
    expect(getPendingSpectatorQueue(roomCode)).toContain('FullWatcher');
    handlers.turnTimer.stop(roomCode);
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import { setupSocketHandlers } from '../../src/ws/socket-handler';
import { GameSession } from '../../src/plugins/core/game/session';
import { emitTerminalStateIfNeeded, markTerminalHandled } from '../../src/ws/game-events';
import type { ActiveRoomInfo } from '@uno-online/shared';
import type { MumbleIceConfig } from '../../src/config';
import { makeFakeIo, type FakeSocket } from '../helpers/fake-io';

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

afterAll(async () => {
  handlers.turnTimer.stopAll();
  await kv.disconnect();
});

async function startGame(owner: FakeSocket, others: FakeSocket[]): Promise<string> {
  const roomCode = (await owner.call('room:create', {})).roomCode as string;
  for (let index = 0; index < others.length; index++) {
    const socket = others[index]!;
    expect((await socket.call('room:join', roomCode)).success).toBe(true);
    expect((await socket.call('seat:take', index + 1)).success).toBe(true);
    expect((await socket.call('room:ready', true)).success).toBe(true);
  }
  expect((await owner.call('room:ready', true)).success).toBe(true);
  expect((await owner.call('game:start')).success).toBe(true);
  return roomCode;
}

function projectedRoom(lobby: FakeSocket, roomCode: string): ActiveRoomInfo | undefined {
  const rooms = lobby.lastEmit('lobby:rooms') as ActiveRoomInfo[] | undefined;
  return rooms?.find(room => room.roomCode === roomCode);
}

describe('live lobby projection', () => {
  it('refreshes spectator counts on active join, disconnect, rejoin and explicit leave', async () => {
    const lobby = await fake.connect('lobby_spec_observer', 'LobbyObserver');
    const owner = await fake.connect('lobby_spec_owner', 'Owner');
    const other = await fake.connect('lobby_spec_other', 'Other');
    const roomCode = await startGame(owner, [other]);
    expect(projectedRoom(lobby, roomCode)).toMatchObject({ playerCount: 2, spectatorCount: 0 });

    const watcher = await fake.connect('lobby_spec_watcher', 'Watcher');
    expect(await watcher.call('room:rejoin', roomCode)).toMatchObject({
      success: true,
      mode: 'spectator',
    });
    expect(projectedRoom(lobby, roomCode)).toMatchObject({ playerCount: 2, spectatorCount: 1 });

    await watcher.trigger('disconnect');
    expect(projectedRoom(lobby, roomCode)).toMatchObject({ playerCount: 2, spectatorCount: 0 });

    const watcherBack = await fake.connect('lobby_spec_watcher', 'Watcher');
    expect((await watcherBack.call('room:rejoin', roomCode)).success).toBe(true);
    expect(projectedRoom(lobby, roomCode)).toMatchObject({ playerCount: 2, spectatorCount: 1 });

    expect(await watcherBack.call('room:leave')).toMatchObject({ success: true });
    expect(projectedRoom(lobby, roomCode)).toMatchObject({ playerCount: 2, spectatorCount: 0 });
  });

  it('refreshes terminal, scoreboard and next-round promotion projections', async () => {
    const lobby = await fake.connect('lobby_round_observer', 'RoundObserver');
    const owner = await fake.connect('lobby_round_owner', 'Owner');
    const second = await fake.connect('lobby_round_second', 'Second');
    const third = await fake.connect('lobby_round_third', 'Third');
    const fourth = await fake.connect('lobby_round_fourth', 'Fourth');
    const roomCode = await startGame(owner, [second, third, fourth]);
    expect(projectedRoom(lobby, roomCode)).toMatchObject({ playerCount: 4, spectatorCount: 0 });

    const playing = handlers.sessions.get(roomCode)!.getFullState();
    const terminal = GameSession.fromState({ ...playing, phase: 'round_end' });
    handlers.sessions.set(roomCode, terminal);
    const terminalBroadcastsBefore = lobby.emitted.filter(item => item.event === 'lobby:rooms').length;
    expect(
      await emitTerminalStateIfNeeded(
        fake.io,
        roomCode,
        terminal,
        handlers.turnTimer,
        kv,
        handlers.sessions,
        handlers.persister,
      ),
    ).toBe(true);
    expect(lobby.emitted.filter(item => item.event === 'lobby:rooms').length).toBeGreaterThan(terminalBroadcastsBefore);

    expect(await owner.call('game:kick_player', { targetId: 'lobby_round_fourth' })).toMatchObject({ success: true });
    expect(projectedRoom(lobby, roomCode)).toMatchObject({ playerCount: 3, spectatorCount: 1 });

    expect(await third.call('game:leave_to_spectate')).toMatchObject({ success: true });
    expect(projectedRoom(lobby, roomCode)).toMatchObject({ playerCount: 2, spectatorCount: 2 });

    const queued = await fake.connect('lobby_round_queued', 'Queued');
    expect((await queued.call('room:rejoin', roomCode)).success).toBe(true);
    expect(await queued.call('game:spectator_join')).toMatchObject({ success: true, queued: true });
    markTerminalHandled(roomCode, Date.now() - 11_000);
    const startResults = [
      await second.call('game:next_round'),
      await owner.call('game:next_round'),
      await owner.call('game:next_round'),
    ];
    expect(startResults).toContainEqual(expect.objectContaining({ success: true, started: true }));
    expect(projectedRoom(lobby, roomCode)).toMatchObject({ playerCount: 3, spectatorCount: 2 });

    const nextRound = handlers.sessions.get(roomCode)!;
    nextRound.forceGameOver('lobby_round_owner');
    expect(
      await emitTerminalStateIfNeeded(
        fake.io,
        roomCode,
        nextRound,
        handlers.turnTimer,
        kv,
        handlers.sessions,
        handlers.persister,
      ),
    ).toBe(true);
    expect(projectedRoom(lobby, roomCode)).toBeUndefined();
  });
});

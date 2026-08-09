import type { PlayerView } from '@uno-online/shared';
import { describe, expect, it } from 'vitest';
import type { MumbleIceConfig } from '../../src/config';
import { MemoryKvStore } from '../../src/kv/memory';
import { NamespacedKvStore } from '../../src/kv/namespaced';
import { shutdownServer } from '../../src/shutdown';
import { setupSocketHandlers } from '../../src/ws/socket-handler';
import { makeFakeIo, type FakeSocket } from '../helpers/fake-io';

const MUMBLE_DISABLED: MumbleIceConfig = {
  enabled: false,
  host: '',
  port: 6502,
  serverId: 1,
  parentChannelId: 0,
  channelNamePrefix: 'test',
};

/**
 * MemoryKvStore normally clears itself when its sole client disconnects. For
 * this test it represents the Redis server, whose data survives each app's
 * client connection. forceReset is only used after both app lifetimes end.
 */
class PersistentMemoryBackend extends MemoryKvStore {
  override async disconnect(): Promise<void> {}

  async forceReset(): Promise<void> {
    await super.disconnect();
  }
}

function createSocketRuntime(backend: PersistentMemoryBackend) {
  const kv = new NamespacedKvStore(backend, 'uno:runtime:vcontinuity-test');
  const fake = makeFakeIo();
  const handlers = setupSocketHandlers(fake.io, kv, 'restart-continuity-secret', 60_000, MUMBLE_DISABLED);
  const sockets: FakeSocket[] = [];

  return {
    kv,
    fake,
    handlers,
    sockets,
    async connect(userId: string, nickname: string): Promise<FakeSocket> {
      const socket = await fake.connect(userId, nickname);
      sockets.push(socket);
      for (let attempt = 0; attempt < 50 && !socket.lastEmit('lobby:rooms'); attempt += 1) {
        await Promise.resolve();
      }
      if (!socket.lastEmit('lobby:rooms')) {
        throw new Error(`Socket ${userId} did not finish connection initialization`);
      }
      return socket;
    },
  };
}

type SocketRuntime = ReturnType<typeof createSocketRuntime>;

async function closeSocketRuntime(runtime: SocketRuntime): Promise<void> {
  await shutdownServer({
    fastify: {
      // Fake the transport portion of Fastify/Socket.IO close. The real app's
      // preClose hook is covered separately; here we want disconnect commits
      // and the final snapshot flush before rebuilding the whole WS runtime.
      close: async () => {
        await Promise.all(runtime.sockets.map(socket => socket.trigger('disconnect')));
      },
    },
    driver: {
      beginShutdown: runtime.handlers.beginShutdown,
      drain: runtime.handlers.drain,
    },
    persister: runtime.handlers.persister,
    voiceChannels: runtime.handlers.voiceChannels,
    closeDatabase: async () => {},
    kv: runtime.kv,
  });
}

function continuationIdentity(view: PlayerView) {
  const viewer = view.players.find(player => player.id === view.viewerId);
  if (!viewer) throw new Error(`Missing viewer ${view.viewerId}`);
  return {
    viewerId: view.viewerId,
    handIds: viewer.hand.map(card => card.id).sort(),
    deckHash: view.deckHash,
    gameStartedAt: view.gameStartedAt,
    turnStartedAt: view.turnStartedAt,
  };
}

describe('compatible runtime restart continuity', () => {
  it('rebuilds app/session state from the same namespaced persistent KV', async () => {
    const backend = new PersistentMemoryBackend();
    let firstRuntime: SocketRuntime | null = createSocketRuntime(backend);
    let secondRuntime: SocketRuntime | null = null;
    let firstClosed = false;
    let secondClosed = false;

    try {
      const owner = await firstRuntime.connect('restart_owner', 'RestartOwner');
      const member = await firstRuntime.connect('restart_member', 'RestartMember');
      const created = await owner.call('room:create', {});
      expect(created).toMatchObject({ success: true });
      const roomCode = created.roomCode as string;

      expect(await member.call('room:join', roomCode)).toMatchObject({ success: true });
      expect(await member.call('seat:take', 1)).toMatchObject({ success: true });
      expect(await owner.call('room:ready', true)).toMatchObject({ success: true });
      expect(await member.call('room:ready', true)).toMatchObject({ success: true });
      expect(await owner.call('game:start')).toMatchObject({ success: true });

      const firstSession = firstRuntime.handlers.sessions.get(roomCode);
      expect(firstSession).toBeDefined();
      const beforeOwner = continuationIdentity(firstSession!.getPlayerView('restart_owner'));
      const beforeMember = continuationIdentity(firstSession!.getPlayerView('restart_member'));

      await closeSocketRuntime(firstRuntime);
      firstClosed = true;

      // A new wrapper and a new handler graph model a new backend process;
      // only the namespaced persistent backend is shared between lifetimes.
      secondRuntime = createSocketRuntime(backend);
      expect(secondRuntime.handlers.sessions.size).toBe(0);

      const returningOwner = await secondRuntime.connect('restart_owner', 'RestartOwner');
      const returningMember = await secondRuntime.connect('restart_member', 'RestartMember');
      const ownerRejoin = await returningOwner.call('room:rejoin', roomCode);
      const memberRejoin = await returningMember.call('room:rejoin', roomCode);

      expect(ownerRejoin).toMatchObject({ success: true, mode: 'player' });
      expect(memberRejoin).toMatchObject({ success: true, mode: 'player' });
      expect(secondRuntime.handlers.sessions.get(roomCode)).not.toBe(firstSession);

      const ownerView = ownerRejoin.gameState as PlayerView;
      const memberView = memberRejoin.gameState as PlayerView;
      expect(continuationIdentity(ownerView)).toEqual(beforeOwner);
      expect(continuationIdentity(memberView)).toEqual(beforeMember);
      expect(ownerView.players.find(player => player.id === 'restart_owner')).toMatchObject({
        connected: true,
        autopilot: false,
      });
      expect(memberView.players.find(player => player.id === 'restart_member')).toMatchObject({
        connected: true,
        autopilot: false,
      });

      await closeSocketRuntime(secondRuntime);
      secondClosed = true;
    } finally {
      if (secondRuntime && !secondClosed) await closeSocketRuntime(secondRuntime);
      if (firstRuntime && !firstClosed) await closeSocketRuntime(firstRuntime);
      firstRuntime = null;
      secondRuntime = null;
      await backend.forceReset();
    }
  });
});

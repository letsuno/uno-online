import { type AddressInfo } from 'node:net';
import Fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { io as connectSocket } from 'socket.io-client';
import { describe, expect, it, vi } from 'vitest';
import { registerSocketIoShutdownHook } from '../src/app.js';
import { GameSession } from '../src/plugins/core/game/session.js';
import { loadGameState } from '../src/plugins/core/game/state-store.js';
import { MemoryKvStore } from '../src/kv/memory.js';
import { shutdownServer } from '../src/shutdown.js';
import { setupSocketHandlers } from '../src/ws/socket-handler.js';
import { makeFakeIo } from './helpers/fake-io.js';
import { makeGameState } from './helpers/test-utils.js';

describe('server shutdown', () => {
  it('stops drivers, closes transports, drains admitted work, and flushes final state in order', async () => {
    const calls: string[] = [];
    let flushCount = 0;

    await shutdownServer({
      driver: {
        beginShutdown: () => {
          calls.push('begin');
        },
        drain: async () => {
          calls.push('drain');
        },
      },
      persister: {
        flushAll: async () => {
          calls.push(`flush-${++flushCount}`);
        },
      },
      fastify: {
        close: async () => {
          calls.push('http-close');
        },
      },
      voiceChannels: {
        close: async () => {
          calls.push('voice-close');
        },
      },
      closeDatabase: async () => {
        calls.push('db-close');
      },
      kv: {
        disconnect: async () => {
          calls.push('kv-disconnect');
        },
      },
    });

    expect(calls).toEqual([
      'begin',
      'flush-1',
      'http-close',
      'drain',
      'flush-2',
      'voice-close',
      'db-close',
      'kv-disconnect',
    ]);
  });

  it('closes a real connected Socket.IO client without hanging Fastify close', async () => {
    const fastify = Fastify();
    const io = new SocketIOServer(fastify.server);
    const beginShutdown = vi.fn();
    const drain = vi.fn(async () => undefined);
    registerSocketIoShutdownHook(fastify, io, { beginShutdown, drain });

    await fastify.listen({ host: '127.0.0.1', port: 0 });
    const address = fastify.server.address() as AddressInfo;
    const client = connectSocket(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
      reconnection: false,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        client.once('connect', resolve);
        client.once('connect_error', reject);
      });

      const disconnected = new Promise<void>(resolve => client.once('disconnect', () => resolve()));
      await Promise.race([
        fastify.close(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Fastify close hung with an upgraded socket')), 2_000);
        }),
      ]);
      await disconnected;

      expect(beginShutdown).toHaveBeenCalledOnce();
      expect(drain).toHaveBeenCalledTimes(2);
      expect(client.connected).toBe(false);
    } finally {
      client.disconnect();
      await fastify.close().catch(() => undefined);
    }
  });

  it('waits for a post-commit socket operation and flushes its terminal state', async () => {
    const kv = new MemoryKvStore();
    const fake = makeFakeIo();
    const handlers = setupSocketHandlers(fake.io, kv, 'test-secret', 60_000, {
      enabled: false,
      host: 'localhost',
      port: 6502,
      serverId: 1,
      parentChannelId: 0,
      channelNamePrefix: 'UNO ',
    });
    const socket = await fake.connect('shutdown-owner', 'ShutdownOwner');
    const roomCode = 'SHUT55';
    const session = GameSession.fromState(makeGameState());
    handlers.sessions.set(roomCode, session);
    handlers.persister.markDirty(roomCode, session.getFullState());

    let entered!: () => void;
    const operationEntered = new Promise<void>(resolve => {
      entered = resolve;
    });
    let release!: () => void;
    const postcommitGate = new Promise<void>(resolve => {
      release = resolve;
    });
    (socket as unknown as { on(event: string, listener: () => Promise<void>): void }).on(
      'test:postcommit',
      async () => {
        entered();
        await postcommitGate;
        session.forceGameOver('p1');
        handlers.persister.markDirty(roomCode, session.getFullState());
      },
    );

    const operation = socket.trigger('test:postcommit');
    await operationEntered;
    let transportClosed!: () => void;
    const transportCloseStarted = new Promise<void>(resolve => {
      transportClosed = resolve;
    });
    const shutdown = shutdownServer({
      fastify: {
        close: async () => {
          transportClosed();
        },
      },
      driver: handlers,
      persister: handlers.persister,
      voiceChannels: { close: async () => undefined },
      closeDatabase: async () => undefined,
      kv: { disconnect: async () => undefined },
    });

    await transportCloseStarted;
    expect((await loadGameState(kv, roomCode))?.phase).toBe('playing');
    release();
    await Promise.all([operation, shutdown]);
    expect((await loadGameState(kv, roomCode))?.phase).toBe('game_over');

    await handlers.voiceChannels.close();
    await kv.disconnect();
  });
});

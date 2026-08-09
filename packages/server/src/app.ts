import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import type { DefaultEventsMap } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@uno-online/shared';
import type { Config } from './config.js';
import { loadPlugins } from './plugin-loader.js';
import { getDb } from './db/database.js';
import { setupSocketHandlers } from './ws/socket-handler.js';
import { dissolveRoom } from './ws/room-lifecycle.js';
import { createKvStore } from './kv/index.js';
import type { PluginContext } from './plugin-context.js';
import { adminOnly } from './plugins/core/admin/middleware.js';
import { aiProviderRegistry } from './ai/model-registry.js';
import type { SocketData } from './ws/types.js';

export function registerSocketIoShutdownHook(
  fastify: FastifyInstance,
  io: SocketIOServer,
  lifecycle: { beginShutdown(): void; drain(): Promise<void> },
): void {
  fastify.addHook('preClose', async () => {
    lifecycle.beginShutdown();
    // Let operations that already passed the closing gate finish while their
    // transport is still available for acknowledgements and projections.
    await lifecycle.drain();
    await new Promise<void>(resolve => {
      io.close(() => resolve());
    });
    // Socket.IO does not await async disconnect listeners.
    await lifecycle.drain();
  });
}

export async function createApp(config: Config) {
  const fastify = Fastify({ logger: true });

  // Community AI plugins contain administrator-installed TypeScript code and
  // optional ONNX sessions. Discover and compile them exactly once at startup.
  await aiProviderRegistry.initialize();
  fastify.addHook('onClose', async () => {
    await aiProviderRegistry.dispose();
  });

  await fastify.register(cors, {
    origin: config.clientUrl,
    credentials: true,
  });

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>(
    fastify.server,
    {
      cors: {
        origin: config.clientUrl,
        credentials: true,
      },
    },
  );

  const kv = createKvStore(config.redisUrl, `uno:runtime:v${config.runtimeSchemaVersion}`);

  const ctx: PluginContext = { db: getDb(), kv, io, config };
  await loadPlugins(fastify, ctx);

  const wsContext = setupSocketHandlers(io, kv, config.jwtSecret, config.roomIdleTimeoutMs, config.mumbleIce);
  registerSocketIoShutdownHook(fastify, io, wsContext);
  const { sessions, turnTimer, persister } = wsContext;
  ctx.dissolveRoom = (roomCode, reason = 'host_closed') =>
    dissolveRoom(
      io,
      kv,
      roomCode,
      sessions,
      turnTimer,
      persister,
      reason,
      wsContext.voiceChannels,
      wsContext.cleanupRoomRuntime,
    );

  fastify.post<{ Params: { code: string } }>(
    '/api/admin/rooms/:code/cheat',
    { preHandler: adminOnly(config.jwtSecret) },
    async (request, _reply) => {
      const { code } = request.params;
      io.to(code).emit('game:cheat_detected');
      await new Promise(r => setTimeout(r, 1500));
      await ctx.dissolveRoom!(code, 'host_closed');
      return { success: true };
    },
  );

  return { fastify, io, kv, ...wsContext };
}

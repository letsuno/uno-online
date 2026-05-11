import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import type { Config } from './config';
import { loadPlugins } from './plugin-loader';
import { getDb } from './db/database';
import { setupSocketHandlers } from './ws/socket-handler';
import { dissolveRoom } from './ws/room-lifecycle';
import { createKvStore } from './kv/index';
import type { PluginContext } from './plugin-context';
import { adminOnly } from './plugins/core/admin/middleware';

export async function createApp(config: Config) {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, {
    origin: config.clientUrl,
    credentials: true,
  });

  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: config.clientUrl,
      credentials: true,
    },
  });

  const kv = createKvStore(config.redisUrl);

  const ctx: PluginContext = { db: getDb(), kv, io, config };
  await loadPlugins(fastify, ctx);

  const wsContext = setupSocketHandlers(io, kv, config.jwtSecret, config.roomIdleTimeoutMs);
  const { sessions, turnTimer, persister } = wsContext;

  fastify.post<{ Params: { code: string } }>(
    '/api/admin/rooms/:code/cheat',
    { preHandler: adminOnly(config.jwtSecret) },
    async (request, reply) => {
      const { code } = request.params;
      io.to(code).emit('game:cheat_detected');
      await new Promise((r) => setTimeout(r, 1500));
      await dissolveRoom(io, kv, code, sessions, turnTimer, persister, 'host_closed', getDb());
      return { success: true };
    },
  );

  return { fastify, io, kv, ...wsContext };
}

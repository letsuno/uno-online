import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import type { Config } from './config';
import { loadPlugins } from './plugin-loader';
import { getDb } from './db/database';
import { registerProfileRoutes } from './api/profile-routes';
import { setupSocketHandlers } from './ws/socket-handler';
import { createKvStore } from './kv/index';
import type { PluginContext } from './plugin-context';

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

  if (!config.devMode) {
    await registerProfileRoutes(fastify, config);
  }

  const wsContext = setupSocketHandlers(io, kv, config.jwtSecret);

  fastify.get('/health', async () => ({ status: 'ok' }));

  return { fastify, io, kv, ...wsContext };
}

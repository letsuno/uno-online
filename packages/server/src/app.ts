import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import type { Config } from './config.js';
import { registerAuthRoutes } from './api/auth-routes.js';
import { registerProfileRoutes } from './api/profile-routes.js';
import { setupSocketHandlers } from './ws/socket-handler.js';
import { createKvStore } from './kv/index.js';

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

  await registerAuthRoutes(fastify, config);
  await registerProfileRoutes(fastify, config);

  const wsContext = setupSocketHandlers(io, kv, config.jwtSecret);

  fastify.get('/health', async () => ({ status: 'ok' }));

  return { fastify, io, kv, ...wsContext };
}

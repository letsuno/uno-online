import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import type { Config } from './config.js';
import { registerAuthRoutes } from './api/auth-routes.js';
import { registerProfileRoutes } from './api/profile-routes.js';
import { setupSocketHandlers } from './ws/socket-handler.js';
import { getRedis } from './redis/client.js';

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

  const redis = getRedis(config.redisUrl);

  await registerAuthRoutes(fastify, config);
  await registerProfileRoutes(fastify, config);

  const wsContext = setupSocketHandlers(io, redis, config.jwtSecret);

  fastify.get('/health', async () => ({ status: 'ok' }));

  return { fastify, io, redis, ...wsContext };
}

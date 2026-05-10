import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import type { Config } from './config';
import { loadPlugins } from './plugin-loader';
import { getDb } from './db/database';
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

  const wsContext = setupSocketHandlers(io, kv, config.jwtSecret, config.roomIdleTimeoutMs);

  return { fastify, io, kv, ...wsContext };
}

import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import type { ServerInfo } from '@uno-online/shared';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../../../../package.json') as { version: string };

export function registerServerInfoRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const { config, io, kv } = ctx;

  fastify.get('/server/info', async (_request, reply) => {
    void reply.header('Access-Control-Allow-Origin', '*');

    const roomKeys = await kv.keys('room:*');
    const roomCodes = roomKeys.filter(key => /^room:[^:]+$/u.test(key)).map(key => key.slice('room:'.length));

    const info: ServerInfo = {
      name: config.serverName,
      version: pkg.version,
      motd: config.serverMotd,
      onlinePlayers: io.engine.clientsCount,
      activeRooms: roomCodes.length,
      uptime: Math.floor(process.uptime()),
    };

    return info;
  });
}

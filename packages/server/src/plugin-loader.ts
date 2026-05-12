import type { FastifyInstance } from 'fastify';
import type { PluginContext } from './plugin-context.js';
import authPlugin from './plugins/core/auth/index.js';
import profilePlugin from './plugins/core/profile/index.js';
import adminPlugin from './plugins/core/admin/index.js';
import serverInfoPlugin from './plugins/core/server-info/index.js';
import gameHistoryPlugin from './plugins/core/game-history/index.js';
import spectatePlugin from './plugins/core/spectate/index.js';
import apiKeyPlugin from './plugins/core/api-key/index.js';

export async function loadPlugins(fastify: FastifyInstance, ctx: PluginContext): Promise<void> {
  await fastify.register(async (api) => {
    await api.register(authPlugin, { ctx });
    await api.register(profilePlugin, { ctx });
    await api.register(adminPlugin, { ctx });
    await api.register(serverInfoPlugin, { ctx });
    await api.register(gameHistoryPlugin, { ctx });
    await api.register(spectatePlugin, { ctx });
    await api.register(apiKeyPlugin, { ctx });
    api.get('/health', async () => ({ status: 'ok' }));
  }, { prefix: '/api' });
}

import type { FastifyInstance } from 'fastify';
import type { PluginContext } from './plugin-context';
import authPlugin from './plugins/core/auth/index';
import profilePlugin from './plugins/core/profile/index';
import adminPlugin from './plugins/core/admin/index';
import serverInfoPlugin from './plugins/core/server-info/index';
import gameHistoryPlugin from './plugins/core/game-history/index';
import spectatePlugin from './plugins/core/spectate/index';

export async function loadPlugins(fastify: FastifyInstance, ctx: PluginContext): Promise<void> {
  await fastify.register(async (api) => {
    await api.register(authPlugin, { ctx });
    await api.register(profilePlugin, { ctx });
    await api.register(adminPlugin, { ctx });
    await api.register(serverInfoPlugin, { ctx });
    await api.register(gameHistoryPlugin, { ctx });
    await api.register(spectatePlugin, { ctx });
    api.get('/health', async () => ({ status: 'ok' }));
  }, { prefix: '/api' });
}

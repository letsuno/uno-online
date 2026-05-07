import type { FastifyInstance } from 'fastify';
import type { PluginContext } from './plugin-context';
import authPlugin from './plugins/core/auth/index';
import profilePlugin from './plugins/core/profile/index';
import adminPlugin from './plugins/core/admin/index';

export async function loadPlugins(fastify: FastifyInstance, ctx: PluginContext): Promise<void> {
  await fastify.register(authPlugin, { ctx });
  await fastify.register(profilePlugin, { ctx });
  await fastify.register(adminPlugin, { ctx });
}

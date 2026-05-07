import type { FastifyInstance } from 'fastify';
import type { PluginContext } from './plugin-context';
import authPlugin from './plugins/core/auth/index';

export async function loadPlugins(fastify: FastifyInstance, ctx: PluginContext): Promise<void> {
  await fastify.register(authPlugin, { ctx });
}

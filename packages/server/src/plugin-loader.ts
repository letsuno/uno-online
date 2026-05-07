import type { FastifyInstance } from 'fastify';
import type { PluginContext } from './plugin-context';

export async function loadPlugins(fastify: FastifyInstance, ctx: PluginContext): Promise<void> {
  // Core plugins will be registered here as they are migrated
}

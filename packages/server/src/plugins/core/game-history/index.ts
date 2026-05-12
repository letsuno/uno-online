import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import { registerRoutes } from './routes.js';
import { migrate } from './migration.js';

export default async function gameHistoryPlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  await migrate(opts.ctx.db);
  await registerRoutes(fastify, opts.ctx);
}

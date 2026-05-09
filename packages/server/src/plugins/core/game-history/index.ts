import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { registerRoutes } from './routes';
import { migrate } from './migration';

export default async function gameHistoryPlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  await migrate(opts.ctx.db);
  await registerRoutes(fastify, opts.ctx);
}

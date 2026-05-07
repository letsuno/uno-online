import fp from 'fastify-plugin';
import type { PluginContext } from '../../../plugin-context';
import { registerRoutes } from './routes';
import { migrate } from './migration';

export default fp(async (fastify, opts: { ctx: PluginContext }) => {
  await migrate(opts.ctx.db);
  await registerRoutes(fastify, opts.ctx);
}, { name: 'game-history' });

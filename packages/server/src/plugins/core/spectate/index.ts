import fp from 'fastify-plugin';
import type { PluginContext } from '../../../plugin-context';
import { registerRoutes } from './routes';

export default fp(async (fastify, opts: { ctx: PluginContext }) => {
  await registerRoutes(fastify, opts.ctx);
}, { name: 'spectate' });

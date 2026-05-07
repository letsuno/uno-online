import fp from 'fastify-plugin';
import type { PluginContext } from '../../../plugin-context';
import { registerAdminRoutes } from './routes';

export default fp(async (fastify, opts: { ctx: PluginContext }) => {
  registerAdminRoutes(fastify, opts.ctx);
}, { name: 'admin' });

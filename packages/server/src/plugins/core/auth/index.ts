import fp from 'fastify-plugin';
import type { PluginContext } from '../../../plugin-context';
import { registerAuthRoutes } from './routes';

export default fp(async (fastify, opts: { ctx: PluginContext }) => {
  registerAuthRoutes(fastify, opts.ctx);
}, { name: 'auth' });

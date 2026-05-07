import fp from 'fastify-plugin';
import type { PluginContext } from '../../../plugin-context';
import { registerServerInfoRoutes } from './routes';

export default fp(async (fastify, opts: { ctx: PluginContext }) => {
  registerServerInfoRoutes(fastify, opts.ctx);
}, { name: 'server-info' });

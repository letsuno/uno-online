import fp from 'fastify-plugin';
import type { PluginContext } from '../../../plugin-context';
import { registerProfileRoutes } from './routes';

export default fp(async (fastify, opts: { ctx: PluginContext }) => {
  registerProfileRoutes(fastify, opts.ctx);
}, { name: 'profile' });

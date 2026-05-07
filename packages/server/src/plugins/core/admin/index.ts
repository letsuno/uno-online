import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { registerAdminRoutes } from './routes';

export default async function adminPlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  registerAdminRoutes(fastify, opts.ctx);
}

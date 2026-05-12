import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import { registerAdminRoutes } from './routes.js';

export default async function adminPlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  registerAdminRoutes(fastify, opts.ctx);
}

import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import { registerRoutes } from './routes.js';

export default async function spectatePlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  await registerRoutes(fastify, opts.ctx);
}

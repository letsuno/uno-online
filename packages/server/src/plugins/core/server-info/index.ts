import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import { registerServerInfoRoutes } from './routes.js';

export default async function serverInfoPlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  registerServerInfoRoutes(fastify, opts.ctx);
}

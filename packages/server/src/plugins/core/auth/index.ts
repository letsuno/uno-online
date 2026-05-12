import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import { registerAuthRoutes } from './routes.js';

export default async function authPlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  registerAuthRoutes(fastify, opts.ctx);
}

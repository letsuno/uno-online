import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import { registerApiKeyRoutes } from './routes.js';

export default async function apiKeyPlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  registerApiKeyRoutes(fastify, opts.ctx);
}

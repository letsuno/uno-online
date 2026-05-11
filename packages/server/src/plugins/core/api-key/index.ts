import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { registerApiKeyRoutes } from './routes';

export default async function apiKeyPlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  registerApiKeyRoutes(fastify, opts.ctx);
}

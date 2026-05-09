import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { registerRoutes } from './routes';

export default async function spectatePlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  await registerRoutes(fastify, opts.ctx);
}

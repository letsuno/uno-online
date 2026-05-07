import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { registerServerInfoRoutes } from './routes';

export default async function serverInfoPlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  registerServerInfoRoutes(fastify, opts.ctx);
}

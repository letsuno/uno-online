import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { registerAuthRoutes } from './routes';

export default async function authPlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  registerAuthRoutes(fastify, opts.ctx);
}

import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { registerProfileRoutes } from './routes';

export default async function profilePlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  registerProfileRoutes(fastify, opts.ctx);
}

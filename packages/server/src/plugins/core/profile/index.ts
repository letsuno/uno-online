import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import { registerProfileRoutes } from './routes.js';

export default async function profilePlugin(fastify: FastifyInstance, opts: { ctx: PluginContext }) {
  registerProfileRoutes(fastify, opts.ctx);
}

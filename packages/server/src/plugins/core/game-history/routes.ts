import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import { authPreHandler } from '../auth/service.js';
import { getGamesList, getGameDetail } from './service.js';

export async function registerRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const preHandler = authPreHandler(ctx.config.jwtSecret);

  fastify.get('/games', { preHandler }, async (request) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10) || 20));
    return getGamesList(ctx.db, page, limit);
  });

  fastify.get('/games/:id', { preHandler }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const detail = await getGameDetail(ctx.db, id);
    if (!detail) return reply.code(404).send({ error: '对局不存在' });
    return detail;
  });

  fastify.get('/games/:id/verify', { preHandler }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const detail = await getGameDetail(ctx.db, id);
    if (!detail) return reply.code(404).send({ error: '对局不存在' });
    return { deckHash: detail.deckHash, initialDeck: detail.initialDeck };
  });
}

import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { authPreHandler } from '../auth/service';
import type { AuthenticatedRequest } from '../auth/service';
import { createApiKey, listApiKeys, deleteApiKey, verifyApiKey } from './repo';

// ── Rate limiter for unauthenticated verify endpoint ──

const verifyRateLimits = new Map<string, { count: number; resetAt: number }>();
const VERIFY_MAX_PER_MINUTE = 10;

function checkVerifyRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = verifyRateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    verifyRateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  return entry.count <= VERIFY_MAX_PER_MINUTE;
}

export function registerApiKeyRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const preHandler = authPreHandler(ctx.config.jwtSecret);

  fastify.post<{ Body: { name: string } }>('/api-keys', { preHandler }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const { name } = request.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return reply.code(400).send({ error: '请输入名称' });
    }
    if (name.trim().length > 50) {
      return reply.code(400).send({ error: '名称最长 50 个字符' });
    }
    try {
      const result = await createApiKey(ctx.db, userId, name.trim());
      return reply.code(201).send(result);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  fastify.get('/api-keys', { preHandler }, async (request) => {
    const { userId } = (request as AuthenticatedRequest).user;
    return listApiKeys(ctx.db, userId);
  });

  fastify.delete<{ Params: { id: string } }>('/api-keys/:id', { preHandler }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const deleted = await deleteApiKey(ctx.db, request.params.id, userId);
    if (!deleted) return reply.code(404).send({ error: 'Key 不存在' });
    return { success: true };
  });

  fastify.post<{ Body: { key: string } }>('/api-keys/verify', async (request, reply) => {
    const ip = request.ip;
    if (!checkVerifyRateLimit(ip)) {
      return reply.code(429).send({ error: '请求过于频繁，请稍后再试' });
    }
    const { key } = request.body;
    if (!key || typeof key !== 'string') {
      return reply.code(400).send({ error: '缺少 key' });
    }
    const user = await verifyApiKey(ctx.db, key);
    if (!user) return reply.code(401).send({ error: '无效的 API Key' });
    return user;
  });
}

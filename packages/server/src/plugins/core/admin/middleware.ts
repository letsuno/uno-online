import type { FastifyRequest, FastifyReply } from 'fastify';
import { authPreHandler, type AuthenticatedRequest } from '../auth/service.js';

export function adminOnly(jwtSecret: string) {
  const auth = authPreHandler(jwtSecret);
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await auth(request, reply);
    if (reply.sent) return;
    if ((request as AuthenticatedRequest).user.role !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required' });
    }
  };
}

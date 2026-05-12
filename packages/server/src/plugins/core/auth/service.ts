import type { FastifyRequest, FastifyReply } from 'fastify';
import { signToken, verifyToken } from '../../../auth/jwt.js';
import type { TokenPayload } from '../../../auth/jwt.js';
import type { UserRole } from '@uno-online/shared';
import { resolveAvatar } from '../../../db/user-repo.js';

export interface AuthenticatedRequest extends FastifyRequest {
  user: TokenPayload;
}

export function userResponse(user: { id: string; username: string; nickname: string; avatarUrl: string | null; avatarData?: string | null; role?: string }) {
  return { id: user.id, username: user.username, nickname: user.nickname, avatarUrl: resolveAvatar(user), role: user.role ?? 'normal' };
}

export function makeToken(user: { id: string; username: string; nickname: string; avatarUrl: string | null; avatarData?: string | null; role?: string }, secret: string) {
  return signToken({ userId: user.id, username: user.username, nickname: user.nickname, avatarUrl: resolveAvatar(user), role: (user.role ?? 'normal') as UserRole }, secret);
}

export const authPreHandler = (jwtSecret: string) => async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  const payload = verifyToken(authHeader.slice(7), jwtSecret);
  if (!payload) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
  (request as AuthenticatedRequest).user = payload;
};

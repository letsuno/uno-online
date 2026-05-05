import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Socket } from 'socket.io';
import { verifyToken } from './jwt.js';
import type { TokenPayload } from './jwt.js';

export function createAuthHook(jwtSecret: string) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing authorization header' });
    }
    const token = authHeader.slice(7);
    const payload = verifyToken(token, jwtSecret);
    if (!payload) {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }
    (request as FastifyRequest & { user: TokenPayload }).user = payload;
  };
}

export function authenticateSocket(socket: Socket, jwtSecret: string): TokenPayload | null {
  const token = socket.handshake.auth?.['token'] as string | undefined;
  if (!token) return null;
  return verifyToken(token, jwtSecret);
}

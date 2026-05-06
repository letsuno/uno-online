import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Config } from '../config';
import { createAuthHook } from '../auth/middleware';
import type { TokenPayload } from '../auth/jwt';
import { getUserProfile } from '../db/user-repo';

interface AuthenticatedRequest extends FastifyRequest {
  user: TokenPayload;
}

export async function registerProfileRoutes(fastify: FastifyInstance, config: Config) {
  const authHook = createAuthHook(config.jwtSecret);

  fastify.get('/profile', { preHandler: authHook }, async (request) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const profile = await getUserProfile(userId);
    if (!profile) return { error: 'User not found' };
    return profile;
  });
}

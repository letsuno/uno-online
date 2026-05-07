import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Config } from '../config';
import { exchangeCodeForToken, fetchGitHubUser } from '../auth/github';
import { signToken, verifyToken } from '../auth/jwt';
import type { TokenPayload } from '../auth/jwt';
import { findOrCreateUser, getUserById } from '../db/user-repo';

interface AuthenticatedRequest extends FastifyRequest {
  user: TokenPayload;
}

export async function registerAuthRoutes(fastify: FastifyInstance, config: Config) {
  if (config.devMode) {
    fastify.post<{ Body: { username: string } }>('/auth/dev-login', async (request, reply) => {
      const { username } = request.body;
      if (!username?.trim()) {
        return reply.code(400).send({ error: 'Missing username' });
      }
      const user = await findOrCreateUser({
        githubId: `dev_${username.trim()}`,
        username: username.trim(),
        avatarUrl: null,
      });
      const token = signToken({ userId: user.id, username: user.username, avatarUrl: user.avatarUrl }, config.jwtSecret);
      return { token, user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl } };
    });
  }

  fastify.get('/auth/github', async (_request, reply) => {
    const params = new URLSearchParams({
      client_id: config.githubClientId,
      redirect_uri: `${config.clientUrl}/auth/callback`,
      scope: 'read:user',
    });
    return reply.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  fastify.post<{ Body: { code: string } }>('/auth/callback', async (request, reply) => {
    const { code } = request.body;
    if (!code) {
      return reply.code(400).send({ error: 'Missing code parameter' });
    }
    try {
      const accessToken = await exchangeCodeForToken(code, config);
      const githubUser = await fetchGitHubUser(accessToken);
      const user = await findOrCreateUser({
        githubId: String(githubUser.id),
        username: githubUser.login,
        avatarUrl: githubUser.avatar_url,
      });
      const token = signToken({ userId: user.id, username: user.username, avatarUrl: user.avatarUrl }, config.jwtSecret);
      return { token, user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl } };
    } catch (err) {
      return reply.code(500).send({ error: 'Authentication failed' });
    }
  });

  fastify.get('/auth/me', {
    preHandler: async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      const payload = verifyToken(authHeader.slice(7), config.jwtSecret);
      if (!payload) {
        return reply.code(401).send({ error: 'Invalid token' });
      }
      (request as AuthenticatedRequest).user = payload;
    },
  }, async (request) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const user = await getUserById(userId);
    if (!user) return { error: 'User not found' };
    return { id: user.id, username: user.username, avatarUrl: user.avatarUrl };
  });
}

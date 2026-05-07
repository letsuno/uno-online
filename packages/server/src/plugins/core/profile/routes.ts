import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { authPreHandler } from '../auth/service';
import type { AuthenticatedRequest } from '../auth/service';
import { getUserProfile, getUserById, updateNickname, updateAvatar, updateUsername, resolveAvatar } from '../../../db/user-repo';
import { validateNickname, validateUsername } from '../../../auth/validation';

export function registerProfileRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const { config } = ctx;

  if (config.devMode) return;

  const preHandler = authPreHandler(config.jwtSecret);

  fastify.get<{ Params: { userId: string } }>('/avatar/:userId', async (request, reply) => {
    const user = await getUserById(request.params.userId);
    if (!user?.avatarData) {
      return reply.code(404).send({ error: 'No avatar' });
    }

    const match = user.avatarData.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return reply.code(404).send({ error: 'Invalid avatar data' });
    }

    const etag = `"${user.updatedAt}"`;
    if (request.headers['if-none-match'] === etag) {
      return reply.code(304).send();
    }

    const mimeType = match[1]!;
    const buffer = Buffer.from(match[2]!, 'base64');

    reply
      .header('Content-Type', mimeType)
      .header('Cache-Control', 'public, max-age=86400')
      .header('ETag', etag)
      .send(buffer);
  });

  fastify.get('/profile', { preHandler }, async (request) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const profile = await getUserProfile(userId);
    if (!profile) return { error: 'User not found' };
    return {
      user: { ...profile.user, avatarUrl: resolveAvatar(profile.user) },
      recentGames: profile.recentGames,
    };
  });

  fastify.patch<{ Body: { nickname?: string; username?: string } }>('/profile', { preHandler }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const { nickname, username } = request.body;

    if (nickname !== undefined) {
      const nv = validateNickname(nickname);
      if (!nv.valid) return reply.code(400).send({ error: nv.error });
      await updateNickname(userId, nickname.trim());
    }

    if (username !== undefined) {
      const uv = validateUsername(username);
      if (!uv.valid) return reply.code(400).send({ error: uv.error });
      try {
        await updateUsername(userId, username);
      } catch {
        return reply.code(409).send({ error: '用户名已被使用' });
      }
    }

    return { success: true };
  });

  fastify.post<{ Body: { avatar: string } }>('/profile/avatar', { preHandler }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const { avatar } = request.body;

    if (!avatar) {
      await updateAvatar(userId, null);
      return { success: true, avatarUrl: null };
    }

    if (avatar.length > 100_000) {
      return reply.code(400).send({ error: '头像数据过大' });
    }

    await updateAvatar(userId, avatar);
    return { success: true, avatarUrl: `/avatar/${userId}` };
  });
}

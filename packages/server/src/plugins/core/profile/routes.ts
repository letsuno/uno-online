import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context.js';
import { authPreHandler } from '../auth/service.js';
import type { AuthenticatedRequest } from '../auth/service.js';
import { getUserById, updateNickname, updateAvatar, updateUsername, resolveAvatar } from '../../../db/user-repo.js';
import { validateNickname, validateUsername } from '../../../auth/validation.js';
import { processAvatar, AvatarError } from '../../../auth/avatar.js';

export function registerProfileRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const { config } = ctx;

  // DEV_MODE：临时用户没有 DB 记录，提供基于 JWT 的只读资料视图，
  // 让个人资料弹窗在开发/测试环境可用（PATCH/头像上传等写操作不注册）
  if (config.devMode) {
    const devPreHandler = authPreHandler(config.jwtSecret);
    fastify.get('/profile', { preHandler: devPreHandler }, async (request) => {
      const u = (request as AuthenticatedRequest).user;
      return {
        user: {
          id: u.userId,
          username: u.username,
          nickname: u.nickname,
          avatarUrl: u.avatarUrl ?? null,
          githubId: null,
          role: u.role ?? 'normal',
        },
      };
    });
    return;
  }

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

  fastify.get('/profile', { preHandler }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const user = await getUserById(userId);
    if (!user) return reply.code(401).send({ error: 'User not found' });
    return {
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatarUrl: resolveAvatar(user),
        githubId: user.githubId ?? null,
        role: user.role ?? 'normal',
      },
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

  fastify.post<{ Body: { avatar: string } }>(
    '/profile/avatar',
    { preHandler, bodyLimit: 10 * 1024 * 1024 },
    async (request, reply) => {
      const { userId } = (request as AuthenticatedRequest).user;
      const { avatar } = request.body;

      if (!avatar) {
        await updateAvatar(userId, null);
        return { success: true, avatarUrl: null };
      }

      let avatarData: string;
      try {
        avatarData = await processAvatar(avatar);
      } catch (e) {
        return reply.code(400).send({ error: e instanceof AvatarError ? e.message : '头像处理失败' });
      }

      await updateAvatar(userId, avatarData);
      return { success: true, avatarUrl: `/api/avatar/${userId}` };
    },
  );
}

import type { FastifyInstance } from 'fastify';
import type { PluginContext } from '../../../plugin-context';
import { exchangeCodeForToken, fetchGitHubUser } from '../../../auth/github';
import { findOrCreateUser, findUserByUsername, createLocalUser, isUsernameTaken, setPassword, bindGithub, getUserById } from '../../../db/user-repo';
import { hashPassword, verifyPassword } from '../../../auth/password';
import { validateUsername, validatePassword, validateNickname } from '../../../auth/validation';
import { authPreHandler, makeToken, userResponse } from './service';
import type { AuthenticatedRequest } from './service';

export function registerAuthRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const { config } = ctx;

  fastify.get('/auth/config', async () => ({
    devMode: config.devMode,
    githubClientId: config.githubClientId,
  }));

  if (config.devMode) {
    registerDevRoutes(fastify, ctx);
    return;
  }

  registerProductionRoutes(fastify, ctx);
}

function registerDevRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const { config } = ctx;
  let counter = 0;

  fastify.post<{ Body: { username: string } }>('/auth/dev-login', async (request, reply) => {
    const { username } = request.body;
    if (!username?.trim()) {
      return reply.code(400).send({ error: 'Missing username' });
    }
    const name = username.trim();
    const id = `ephemeral_${++counter}_${Date.now()}`;
    const token = makeToken({ id, username: name, nickname: name, avatarUrl: null, role: 'normal' }, config.jwtSecret);
    return { token, user: { id, username: name, nickname: name, avatarUrl: null, role: 'normal' } };
  });

  fastify.get('/auth/me', { preHandler: authPreHandler(config.jwtSecret) }, async (request) => {
    const p = (request as AuthenticatedRequest).user;
    return { id: p.userId, username: p.username, nickname: p.nickname, avatarUrl: p.avatarUrl ?? null, role: p.role ?? 'normal' };
  });
}

function registerProductionRoutes(fastify: FastifyInstance, ctx: PluginContext) {
  const { config } = ctx;
  const preHandler = authPreHandler(config.jwtSecret);

  fastify.post<{ Body: { username: string; password: string; nickname: string; avatar?: string } }>('/auth/register', async (request, reply) => {
    const { username, password, nickname, avatar } = request.body;

    const uv = validateUsername(username);
    if (!uv.valid) return reply.code(400).send({ error: uv.error });
    const pv = validatePassword(password);
    if (!pv.valid) return reply.code(400).send({ error: pv.error });
    const nv = validateNickname(nickname);
    if (!nv.valid) return reply.code(400).send({ error: nv.error });

    if (await isUsernameTaken(username)) {
      return reply.code(409).send({ error: '用户名已被使用' });
    }

    if (avatar && avatar.length > 100_000) {
      return reply.code(400).send({ error: '头像数据过大' });
    }

    const passwordHash = await hashPassword(password);
    const user = await createLocalUser({ username, nickname: nickname.trim(), passwordHash, avatarData: avatar ?? null });
    const token = makeToken(user, config.jwtSecret);
    return { token, user: userResponse(user) };
  });

  fastify.post<{ Body: { username: string; password: string } }>('/auth/login', async (request, reply) => {
    const { username, password } = request.body;
    if (!username || !password) {
      return reply.code(400).send({ error: '请输入用户名和密码' });
    }

    const user = await findUserByUsername(username);
    if (!user || !user.passwordHash) {
      return reply.code(401).send({ error: '用户名或密码错误' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: '用户名或密码错误' });
    }

    const token = makeToken(user, config.jwtSecret);
    return { token, user: userResponse(user) };
  });

  fastify.post<{ Body: { password: string } }>('/auth/set-password', { preHandler }, async (request, reply) => {
    const { password } = request.body;
    const pv = validatePassword(password);
    if (!pv.valid) return reply.code(400).send({ error: pv.error });

    const { userId } = (request as AuthenticatedRequest).user;
    const passwordHash = await hashPassword(password);
    await setPassword(userId, passwordHash);
    return { success: true };
  });

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
      const githubUser = await fetchGitHubUser(accessToken, config);
      const githubId = String(githubUser.id);

      const existing = await findUserByUsername(githubUser.login);
      if (existing && existing.githubId !== githubId) {
        return {
          needsBind: true,
          username: githubUser.login,
          githubId,
          githubAvatarUrl: githubUser.avatar_url,
        };
      }

      const user = await findOrCreateUser({
        githubId,
        username: githubUser.login,
        avatarUrl: githubUser.avatar_url,
      });
      const token = makeToken(user, config.jwtSecret);
      return { token, user: userResponse(user), isNewUser: user.isNewUser };
    } catch (err) {
      return reply.code(500).send({ error: 'Authentication failed' });
    }
  });

  fastify.post<{ Body: { username: string; password: string; githubId: string; githubAvatarUrl?: string } }>('/auth/bind-github', async (request, reply) => {
    const { username, password, githubId, githubAvatarUrl } = request.body;
    if (!username || !password || !githubId) {
      return reply.code(400).send({ error: '参数不完整' });
    }

    const user = await findUserByUsername(username);
    if (!user || !user.passwordHash) {
      return reply.code(401).send({ error: '用户名或密码错误' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: '用户名或密码错误' });
    }

    await bindGithub(user.id, githubId, githubAvatarUrl ?? null);
    const updated = await getUserById(user.id);
    if (!updated) return reply.code(500).send({ error: 'Bind failed' });
    const token = makeToken(updated, config.jwtSecret);
    return { token, user: userResponse(updated) };
  });

  fastify.get('/auth/me', { preHandler }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).user;
    const user = await getUserById(userId);
    if (!user) return reply.code(401).send({ error: 'User not found' });
    return userResponse(user);
  });
}

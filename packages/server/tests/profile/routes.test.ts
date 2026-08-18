import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signToken } from '../../src/auth/jwt.js';
import type { PluginContext } from '../../src/plugin-context.js';

const users = vi.hoisted(() => ({
  getUserById: vi.fn(),
  updateNickname: vi.fn(),
  updateAvatar: vi.fn(),
  updateUsername: vi.fn(),
  resolveAvatar: vi.fn(),
}));

vi.mock('../../src/db/user-repo.js', () => users);

import { registerProfileRoutes } from '../../src/plugins/core/profile/routes.js';

const JWT_SECRET = 'profile-route-test-secret-at-least-32-chars';
const token = signToken(
  {
    userId: 'user-1',
    username: 'alice',
    nickname: 'Alice',
    avatarUrl: null,
    role: 'normal',
    isBot: false,
  },
  JWT_SECRET,
);

async function updateUsernameRequest() {
  const fastify = Fastify();
  registerProfileRoutes(fastify, {
    config: { jwtSecret: JWT_SECRET, devMode: false },
  } as unknown as PluginContext);
  const response = await fastify.inject({
    method: 'PATCH',
    url: '/profile',
    headers: { authorization: `Bearer ${token}` },
    payload: { username: 'newname' },
  });
  await fastify.close();
  return response;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('profile route error boundaries', () => {
  it('maps a SQLite UNIQUE constraint to username conflict', async () => {
    users.updateUsername.mockRejectedValueOnce({
      code: 'ERR_SQLITE_ERROR',
      errcode: 2067,
      message: 'UNIQUE constraint failed: users.username',
    });

    const response = await updateUsernameRequest();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: '用户名已被使用' });
  });

  it('returns a sanitized 500 for unrelated database errors', async () => {
    users.updateUsername.mockRejectedValueOnce(new Error('database password leaked'));

    const response = await updateUsernameRequest();

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('database password leaked');
    expect(response.body).toContain('更新用户名失败');
  });
});

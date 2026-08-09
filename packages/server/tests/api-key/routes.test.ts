import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signToken } from '../../src/auth/jwt.js';
import type { PluginContext } from '../../src/plugin-context.js';

const repo = vi.hoisted(() => {
  class ApiKeyLimitReachedError extends Error {
    constructor() {
      super('最多创建 10 个 API Key');
      this.name = 'ApiKeyLimitReachedError';
    }
  }
  return {
    ApiKeyLimitReachedError,
    createApiKey: vi.fn(),
    listApiKeys: vi.fn(),
    deleteApiKey: vi.fn(),
    verifyApiKey: vi.fn(),
  };
});

vi.mock('../../src/plugins/core/api-key/repo.js', () => repo);

import { registerApiKeyRoutes } from '../../src/plugins/core/api-key/routes.js';

const JWT_SECRET = 'api-key-route-test-secret-at-least-32-chars';
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

async function createKeyRequest() {
  const fastify = Fastify();
  registerApiKeyRoutes(fastify, {
    config: { jwtSecret: JWT_SECRET },
  } as unknown as PluginContext);
  const response = await fastify.inject({
    method: 'POST',
    url: '/api-keys',
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Agent key' },
  });
  await fastify.close();
  return response;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('API key route error boundaries', () => {
  it('maps only the key-count domain error to a client error', async () => {
    repo.createApiKey.mockRejectedValueOnce(new repo.ApiKeyLimitReachedError());

    const response = await createKeyRequest();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: '最多创建 10 个 API Key' });
  });

  it('returns a sanitized 500 for database failures', async () => {
    repo.createApiKey.mockRejectedValueOnce(new Error('sqlite path=/secret/db failed'));

    const response = await createKeyRequest();

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('/secret/db');
    expect(response.body).toContain('创建 API Key 失败');
  });
});

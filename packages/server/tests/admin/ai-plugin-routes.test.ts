import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signToken } from '../../src/auth/jwt.js';
import {
  AiPluginNotFoundError,
  BuiltInAiPluginMutationError,
  aiProviderRegistry,
} from '../../src/ai/model-registry.js';
import type { PluginContext } from '../../src/plugin-context.js';
import { registerAdminRoutes } from '../../src/plugins/core/admin/routes.js';

const JWT_SECRET = 'admin-ai-route-test-secret-at-least-32-chars';
const token = signToken(
  {
    userId: 'admin',
    username: 'admin',
    nickname: 'Admin',
    avatarUrl: null,
    role: 'admin',
    isBot: false,
  },
  JWT_SECRET,
);

async function togglePlugin(error: Error) {
  vi.spyOn(aiProviderRegistry, 'setCommunityPluginEnabled').mockRejectedValueOnce(error);
  const fastify = Fastify();
  registerAdminRoutes(fastify, {
    config: { jwtSecret: JWT_SECRET },
  } as unknown as PluginContext);
  const response = await fastify.inject({
    method: 'PATCH',
    url: '/admin/ai-plugins/plugin-id',
    headers: { authorization: `Bearer ${token}` },
    payload: { enabled: false },
  });
  await fastify.close();
  return response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('admin AI plugin route error boundaries', () => {
  it('maps a missing plugin domain error to 404', async () => {
    const response = await togglePlugin(new AiPluginNotFoundError());

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'AI 插件不存在' });
  });

  it('maps a built-in plugin mutation domain error to 400', async () => {
    const response = await togglePlugin(new BuiltInAiPluginMutationError());

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: '内置 AI 插件不能停用' });
  });

  it('returns a sanitized 500 when the settings file cannot be written', async () => {
    const response = await togglePlugin(new Error('EACCES /secret/settings.json'));

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('/secret/settings.json');
    expect(response.body).toContain('保存 AI 插件设置失败');
  });
});

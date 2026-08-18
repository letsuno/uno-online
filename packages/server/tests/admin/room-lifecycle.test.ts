import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import { signToken } from '../../src/auth/jwt.js';
import { MemoryKvStore } from '../../src/kv/memory.js';
import type { PluginContext } from '../../src/plugin-context.js';
import { registerAdminRoutes } from '../../src/plugins/core/admin/routes.js';
import { createRoom } from '../../src/plugins/core/room/store.js';

const JWT_SECRET = 'admin-room-test-secret-at-least-32-chars';

describe('admin room deletion', () => {
  it('delegates to the live websocket lifecycle instead of deleting KV directly', async () => {
    const fastify = Fastify();
    const kv = new MemoryKvStore();
    await createRoom(kv, 'ADMIN1', 'owner', {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    });
    const dissolveRoom = vi.fn(async () => {});
    const ctx = {
      kv,
      config: { jwtSecret: JWT_SECRET },
      dissolveRoom,
    } as unknown as PluginContext;
    registerAdminRoutes(fastify, ctx);
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

    const response = await fastify.inject({
      method: 'DELETE',
      url: '/admin/rooms/ADMIN1',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(dissolveRoom).toHaveBeenCalledWith('ADMIN1', 'host_closed');
    await fastify.close();
  });
});

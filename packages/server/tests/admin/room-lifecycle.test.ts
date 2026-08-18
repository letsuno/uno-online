import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import { signToken } from '../../src/auth/jwt.js';
import { MemoryKvStore } from '../../src/kv/memory.js';
import type { PluginContext } from '../../src/plugin-context.js';
import { registerAdminRoutes } from '../../src/plugins/core/admin/routes.js';
import { createRoom } from '../../src/plugins/core/room/store.js';

const JWT_SECRET = 'admin-room-test-secret-at-least-32-chars';
const ADMIN_IDENTITY = {
  userId: 'admin',
  username: 'admin',
  nickname: 'Admin',
  avatarUrl: null,
  role: 'admin',
  isBot: false,
} as const;

async function createHarness(roomCode?: string) {
  const fastify = Fastify();
  const kv = new MemoryKvStore();
  if (roomCode) {
    await createRoom(kv, roomCode, 'owner', {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    });
  }
  const dissolveRoom = vi.fn(async () => {});
  const ctx = {
    kv,
    config: { jwtSecret: JWT_SECRET },
    dissolveRoom,
  } as unknown as PluginContext;
  registerAdminRoutes(fastify, ctx);
  const token = signToken(ADMIN_IDENTITY, JWT_SECRET);
  return { fastify, dissolveRoom, token };
}

describe('admin room lifecycle', () => {
  it('delegates to the live websocket lifecycle instead of deleting KV directly', async () => {
    const { fastify, dissolveRoom, token } = await createHarness('ADMIN1');

    const response = await fastify.inject({
      method: 'DELETE',
      url: '/admin/rooms/ADMIN1',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(dissolveRoom).toHaveBeenCalledWith('ADMIN1', 'host_closed');
    await fastify.close();
  });

  it('commits cheat termination through the same authoritative room lifecycle', async () => {
    const { fastify, dissolveRoom, token } = await createHarness('ADMIN2');

    const response = await fastify.inject({
      method: 'POST',
      url: '/admin/rooms/ADMIN2/cheat',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(dissolveRoom).toHaveBeenCalledWith('ADMIN2', 'cheat_detected');
    await fastify.close();
  });

  it('rejects cheat termination for a room that no longer exists', async () => {
    const { fastify, dissolveRoom, token } = await createHarness();

    const response = await fastify.inject({
      method: 'POST',
      url: '/admin/rooms/MISSING/cheat',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(dissolveRoom).not.toHaveBeenCalled();
    await fastify.close();
  });
});

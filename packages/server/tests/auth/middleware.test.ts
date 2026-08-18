import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import { MemoryKvStore } from '../../src/kv/memory';
import { RoomManager } from '../../src/plugins/core/room/manager';
import { getRoomSeats } from '../../src/plugins/core/room/store';
import { getHumanRoomMemberIds } from '../../src/ws/room-membership';

const mocks = vi.hoisted(() => ({
  verifyApiKey: vi.fn(),
}));

vi.mock('../../src/db/database.js', () => ({
  getDb: () => ({}),
}));

vi.mock('../../src/plugins/core/api-key/repo.js', () => ({
  verifyApiKey: mocks.verifyApiKey,
}));

import { authenticateSocketAsync } from '../../src/auth/middleware';

afterEach(() => {
  vi.clearAllMocks();
});

describe('Socket API-key authentication', () => {
  it('keeps an MCP/API-key account in the human room lifecycle', async () => {
    mocks.verifyApiKey.mockResolvedValue({
      userId: 'mcp-user',
      username: 'mcp-user',
      nickname: 'MCP User',
      avatarUrl: null,
      role: 'normal',
    });
    const socket = {
      handshake: { auth: { token: 'uno_ak_current' } },
    } as unknown as Socket;

    const identity = await authenticateSocketAsync(socket, 'test-secret');
    expect(identity).toMatchObject({ userId: 'mcp-user', isBot: false });

    const kv = new MemoryKvStore();
    const manager = new RoomManager(kv);
    const roomCode = await manager.createRoom(
      identity!.userId,
      identity!.nickname,
      {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: DEFAULT_HOUSE_RULES,
        allowSpectators: true,
        spectatorMode: 'hidden',
      },
      identity!.avatarUrl,
      identity!.role,
    );

    expect((await getRoomSeats(kv, roomCode))[0]?.isBot).toBe(false);
    expect((await getHumanRoomMemberIds(kv, roomCode)).has('mcp-user')).toBe(true);
    await kv.disconnect();
  });
});

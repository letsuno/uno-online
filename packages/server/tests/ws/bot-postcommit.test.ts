import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory.js';
import { getRoomSeats } from '../../src/plugins/core/room/store.js';
import { setupSocketHandlers } from '../../src/ws/socket-handler.js';
import type { MumbleIceConfig } from '../../src/config.js';
import { makeFakeIo } from '../helpers/fake-io.js';

const mumbleIce: MumbleIceConfig = {
  enabled: false,
  host: '',
  port: 0,
  serverId: 1,
  parentChannelId: 0,
  channelNamePrefix: 'test',
};

class BotProjectionFailingKvStore extends MemoryKvStore {
  loseNextSeatWriteResponse = false;
  failProjectionAfterNextSeatWrite = false;
  failNextLobbyProjection = false;
  private failNextSeatRead = false;

  override async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await super.set(key, value, ttlSeconds);
    if (!key.endsWith(':seats')) return;
    if (this.loseNextSeatWriteResponse) {
      this.loseNextSeatWriteResponse = false;
      throw new Error('injected committed seat write response loss');
    }
    if (this.failProjectionAfterNextSeatWrite) {
      this.failProjectionAfterNextSeatWrite = false;
      this.failNextSeatRead = true;
    }
  }

  override async get(key: string): Promise<string | null> {
    if (this.failNextSeatRead && key.endsWith(':seats')) {
      this.failNextSeatRead = false;
      throw new Error('injected post-commit roster read failure');
    }
    return super.get(key);
  }

  override async keys(pattern: string): Promise<string[]> {
    if (this.failNextLobbyProjection && pattern === 'room:*') {
      this.failNextLobbyProjection = false;
      throw new Error('injected lobby projection failure');
    }
    return super.keys(pattern);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bot mutation commit boundaries', () => {
  it('acknowledges a bot added by a seat write whose response was lost', async () => {
    const kv = new BotProjectionFailingKvStore();
    const fake = makeFakeIo();
    const handlers = setupSocketHandlers(fake.io, kv, 'test-secret', 60_000, mumbleIce);
    try {
      const owner = await fake.connect('bot_commit_owner', 'BotCommitOwner');
      const roomCode = (await owner.call('room:create', {})).roomCode as string;
      kv.loseNextSeatWriteResponse = true;

      const result = await owner.call('room:add_bot', { difficulty: 'easy' });
      expect(result).toMatchObject({ success: true });
      expect((await getRoomSeats(kv, roomCode)).filter(seat => seat?.isBot)).toHaveLength(1);
    } finally {
      handlers.turnTimer.stopAll();
    }
  });

  it('keeps add, update and remove acknowledgements after projection failures', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const kv = new BotProjectionFailingKvStore();
    const fake = makeFakeIo();
    const handlers = setupSocketHandlers(fake.io, kv, 'test-secret', 60_000, mumbleIce);
    try {
      const owner = await fake.connect('bot_projection_owner', 'BotProjectionOwner');
      const roomCode = (await owner.call('room:create', {})).roomCode as string;

      kv.failProjectionAfterNextSeatWrite = true;
      kv.failNextLobbyProjection = true;
      const added = await owner.call('room:add_bot', { difficulty: 'easy' });
      expect(added).toMatchObject({ success: true });
      const botId = added.botId as string;
      expect((await getRoomSeats(kv, roomCode)).filter(seat => seat?.userId === botId)).toHaveLength(1);

      kv.failProjectionAfterNextSeatWrite = true;
      expect(await owner.call('room:set_bot_difficulty', { botId, difficulty: 'hard' })).toEqual({ success: true });
      expect((await getRoomSeats(kv, roomCode)).find(seat => seat?.userId === botId)?.botConfig?.difficulty).toBe(
        'hard',
      );

      kv.failProjectionAfterNextSeatWrite = true;
      kv.failNextLobbyProjection = true;
      expect(await owner.call('room:remove_bot', { botId })).toEqual({ success: true });
      expect((await getRoomSeats(kv, roomCode)).some(seat => seat?.userId === botId)).toBe(false);
    } finally {
      handlers.turnTimer.stopAll();
    }
  });
});

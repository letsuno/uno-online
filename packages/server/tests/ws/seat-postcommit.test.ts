import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory.js';
import type { KvStringBatchOperation } from '../../src/kv/types.js';
import { getRoomSeats, getRoomSpectators } from '../../src/plugins/core/room/store.js';
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

class ActivityFailingKvStore extends MemoryKvStore {
  failNextActivityWrite = false;
  loseNextBatchResponse = false;

  override async hset(key: string, fields: Record<string, string>): Promise<void> {
    if (this.failNextActivityWrite && Object.hasOwn(fields, 'lastActivityAt')) {
      this.failNextActivityWrite = false;
      throw new Error('injected activity failure');
    }
    await super.hset(key, fields);
  }

  override async batchStrings(operations: readonly KvStringBatchOperation[]): Promise<void> {
    await super.batchStrings(operations);
    if (this.loseNextBatchResponse) {
      this.loseNextBatchResponse = false;
      throw new Error('injected committed batch response loss');
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('seat mutation commit boundary', () => {
  it('acknowledges committed seat moves when activity projection fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const kv = new ActivityFailingKvStore();
    const fake = makeFakeIo();
    const handlers = setupSocketHandlers(fake.io, kv, 'test-secret', 60_000, mumbleIce);

    try {
      const owner = await fake.connect('seat_commit_owner', 'Owner');
      const member = await fake.connect('seat_commit_member', 'Member');
      const created = await owner.call('room:create', {});
      expect(created.success).toBe(true);
      const roomCode = created.roomCode as string;
      expect((await member.call('room:join', roomCode)).success).toBe(true);

      kv.failNextActivityWrite = true;
      kv.loseNextBatchResponse = true;
      expect(await member.call('seat:take', 1)).toEqual({ success: true });
      expect((await getRoomSeats(kv, roomCode))[1]?.userId).toBe('seat_commit_member');
      expect(member.data.isSpectator).toBe(false);

      expect(await owner.call('seat:swap_request', 'seat_commit_member')).toEqual({ success: true });
      kv.failNextActivityWrite = true;
      expect(
        await member.call('seat:swap_respond', {
          requesterId: 'seat_commit_owner',
          accept: true,
        }),
      ).toEqual({ success: true });
      expect((await getRoomSeats(kv, roomCode)).map(seat => seat?.userId ?? null).slice(0, 2)).toEqual([
        'seat_commit_member',
        'seat_commit_owner',
      ]);

      kv.failNextActivityWrite = true;
      kv.loseNextBatchResponse = true;
      expect(await member.call('seat:leave')).toEqual({ success: true });
      expect((await getRoomSeats(kv, roomCode))[0]).toBeNull();
      expect((await getRoomSpectators(kv, roomCode)).map(item => item.userId)).toContain('seat_commit_member');
      expect(member.data.isSpectator).toBe(true);

      const waitingSpectator = (await getRoomSpectators(kv, roomCode)).find(
        item => item.userId === 'seat_commit_member',
      );
      expect(waitingSpectator?.connected).toBe(true);
      await member.trigger('disconnect');
      expect((await getRoomSpectators(kv, roomCode)).find(item => item.userId === 'seat_commit_member')).toMatchObject({
        connected: false,
      });
    } finally {
      handlers.turnTimer.stopAll();
    }
  });
});

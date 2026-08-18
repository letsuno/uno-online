import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@uno-online/shared';
import { MemoryKvStore } from '../../src/kv/memory';
import { getGameStateTtlSeconds, setupSocketHandlers } from '../../src/ws/socket-handler';
import type { MumbleIceConfig } from '../../src/config';
import { makeFakeIo } from '../helpers/fake-io';

const mumbleIce: MumbleIceConfig = {
  enabled: false,
  host: '',
  port: 0,
  serverId: 1,
  parentChannelId: 0,
  channelNamePrefix: 'test',
};

describe('socket handler lifecycle configuration', () => {
  it('keeps game snapshots beyond the room idle deadline and a full sweep interval', () => {
    const roomIdleTimeoutMs = 2 * 60 * 60_000;
    const snapshotTtlMs = getGameStateTtlSeconds(roomIdleTimeoutMs) * 1000;

    expect(snapshotTtlMs).toBeGreaterThan(roomIdleTimeoutMs + 60_000);
  });

  it.each([undefined, PROTOCOL_VERSION + 1])(
    'rejects a handshake whose protocol version is %s',
    async protocolVersion => {
      const kv = new MemoryKvStore();
      const fake = makeFakeIo();
      const handlers = setupSocketHandlers(fake.io, kv, 'test-secret', 60_000, mumbleIce);
      const protocolMiddleware = fake.middlewares[0]!;

      const error = await new Promise<Error | undefined>(resolve => {
        void protocolMiddleware({ handshake: { auth: { protocolVersion } } }, resolve);
      });

      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('Protocol mismatch');
      handlers.turnTimer.stopAll();
      await kv.disconnect();
    },
  );
});

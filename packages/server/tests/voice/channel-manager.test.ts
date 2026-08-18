import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MumbleIceConfig } from '../../src/config.js';
import { MemoryKvStore } from '../../src/kv/memory.js';
import { VoiceChannelManager } from '../../src/voice/channel-manager.js';

const config: MumbleIceConfig = {
  enabled: true,
  host: '127.0.0.1',
  port: 6502,
  serverId: 1,
  parentChannelId: 0,
  channelNamePrefix: 'UNO-',
};

function withServer(kv: MemoryKvStore, server: { removeChannel: ReturnType<typeof vi.fn> }): VoiceChannelManager {
  const manager = new VoiceChannelManager(kv, config);
  Reflect.set(manager, 'meta', {
    getServer: vi.fn().mockResolvedValue(server),
  });
  return manager;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VoiceChannelManager channel deletion', () => {
  it('retains a failed deletion mapping and retries it during startup reconciliation', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const kv = new MemoryKvStore();
    await kv.set('voice:room:STALE1:channelId', '42');
    const removeChannel = vi
      .fn()
      .mockRejectedValueOnce(new Error('Mumble temporarily unavailable'))
      .mockResolvedValueOnce(undefined);
    const manager = withServer(kv, { removeChannel });

    await manager.deleteRoomChannel('STALE1');
    expect(await kv.get('voice:room:STALE1:channelId')).toBe('42');

    await manager.reconcileActiveRooms();
    expect(removeChannel).toHaveBeenCalledTimes(2);
    expect(await kv.get('voice:room:STALE1:channelId')).toBeNull();
    await kv.disconnect();
  });

  it('does not erase a newer mapping installed while the old channel is removed', async () => {
    const kv = new MemoryKvStore();
    const key = 'voice:room:RACE01:channelId';
    await kv.set(key, '42');
    const removeChannel = vi.fn().mockImplementation(async () => {
      await kv.set(key, '43');
    });
    const manager = withServer(kv, { removeChannel });

    await manager.deleteRoomChannel('RACE01');

    expect(await kv.get(key)).toBe('43');
    await kv.disconnect();
  });
});

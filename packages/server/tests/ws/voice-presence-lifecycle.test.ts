import { afterAll, describe, expect, it, vi } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import { setupSocketHandlers } from '../../src/ws/socket-handler';
import type { MumbleIceConfig } from '../../src/config';
import { makeFakeIo, FakeSocket } from '../helpers/fake-io';
import { registerVoicePresenceEvents } from '../../src/ws/voice-presence';

const kv = new MemoryKvStore();
const fake = makeFakeIo();
const mumbleIce: MumbleIceConfig = {
  enabled: false,
  host: '',
  port: 0,
  serverId: 1,
  parentChannelId: 0,
  channelNamePrefix: 'test',
};
const handlers = setupSocketHandlers(fake.io, kv, 'test-secret', 60_000, mumbleIce);

afterAll(async () => {
  handlers.turnTimer.stopAll();
  await kv.disconnect();
});

async function joinAsSpectator(owner: FakeSocket, user: FakeSocket): Promise<string> {
  const roomCode = (await owner.call('room:create', {})).roomCode as string;
  expect((await user.call('room:join', roomCode)).success).toBe(true);
  return roomCode;
}

describe('voice presence lifecycle', () => {
  it('returns a failure ACK when voice channel resolution throws', async () => {
    const socket = new FakeSocket('voice_channel_error', 'VoiceError', []);
    socket.data.roomCode = 'VOICE1';
    registerVoicePresenceEvents(socket as never, fake.io as never, async () => {
      throw new Error('injected voice lookup failure');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(socket.call('voice:channel:get')).resolves.toEqual({
      success: false,
      error: '语音频道获取失败，请重试',
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('removes a spectator voice snapshot when they explicitly leave the room', async () => {
    const owner = await fake.connect('voice_leave_owner', 'VoiceOwner');
    const spectator = await fake.connect('voice_leave_spec', 'VoiceSpectator');
    const roomCode = await joinAsSpectator(owner, spectator);

    expect(
      await spectator.call('voice:presence', {
        inVoice: true,
        micEnabled: true,
        speakerMuted: false,
        speaking: true,
      }),
    ).toMatchObject({ success: true });
    expect(fake.lastRoomEmit(roomCode, 'voice:presence')).toHaveProperty('voice_leave_spec');

    expect(await spectator.call('room:leave')).toMatchObject({ success: true });
    expect(fake.lastRoomEmit(roomCode, 'voice:presence')).not.toHaveProperty('voice_leave_spec');
  });

  it('compare-removes only the old socket presence after a multi-tab takeover', async () => {
    const owner = await fake.connect('voice_takeover_owner', 'TakeoverOwner');
    const oldSocket = await fake.connect('voice_takeover_user', 'TakeoverUser');
    const roomCode = await joinAsSpectator(owner, oldSocket);
    await oldSocket.call('voice:presence', {
      inVoice: true,
      micEnabled: true,
      speakerMuted: false,
      speaking: true,
    });

    // Hold the superseded connection open so its disconnect can be replayed
    // deterministically after the replacement has rejoined and published.
    oldSocket.disconnect = () => {};
    const replacement = await fake.connect('voice_takeover_user', 'TakeoverUser');
    expect(await replacement.call('room:rejoin', roomCode)).toMatchObject({ success: true });
    await replacement.call('voice:presence', {
      inVoice: true,
      micEnabled: false,
      speakerMuted: true,
      speaking: false,
    });

    await oldSocket.trigger('disconnect');

    expect(await replacement.call('voice:presence:get')).toMatchObject({
      voice_takeover_user: {
        inVoice: true,
        micEnabled: false,
        speakerMuted: true,
        speaking: false,
      },
    });
  });

  it('clears stale old-socket presence when the replacement has not published voice state', async () => {
    const owner = await fake.connect('voice_stale_owner', 'StaleOwner');
    const oldSocket = await fake.connect('voice_stale_user', 'StaleUser');
    const roomCode = await joinAsSpectator(owner, oldSocket);
    await oldSocket.call('voice:presence', {
      inVoice: true,
      micEnabled: true,
      speakerMuted: false,
      speaking: false,
    });

    oldSocket.disconnect = () => {};
    const replacement = await fake.connect('voice_stale_user', 'StaleUser');
    expect(await replacement.call('room:rejoin', roomCode)).toMatchObject({ success: true });
    await oldSocket.trigger('disconnect');

    expect(await replacement.call('voice:presence:get')).not.toHaveProperty('voice_stale_user');
  });
});

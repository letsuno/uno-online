import { Ice } from '@zeroc/ice';
import type { KvStore } from '../kv/types.js';
import type { MumbleIceConfig } from '../config.js';
import { MumbleServer } from './generated/MumbleServer.js';

const VOICE_CHANNEL_KEY_PREFIX = 'voice:room:';

export class VoiceChannelManager {
  private communicator: Ice.Communicator | null = null;
  private meta: MumbleServer.MetaPrx | null = null;

  constructor(
    private readonly kv: KvStore,
    private readonly config: MumbleIceConfig,
  ) {}

  get enabled(): boolean {
    return this.config.enabled;
  }

  async ensureRoomChannel(roomCode: string): Promise<number | null> {
    if (!this.enabled) return null;

    const key = this.roomChannelKey(roomCode);
    const existing = await this.kv.get(key);
    if (existing) {
      const channelId = Number(existing);
      if (Number.isInteger(channelId) && await this.channelExists(channelId)) {
        return channelId;
      }
    }

    try {
      const server = await this.getServer();
      const name = this.roomChannelName(roomCode);
      const channels = await server.getChannels(this.context());
      for (const [channelId, channel] of channels) {
        if (channel.parent === this.config.parentChannelId && channel.name === name) {
          await this.kv.set(key, String(channelId));
          return channelId;
        }
      }

      const channelId = await server.addChannel(name, this.config.parentChannelId, this.context());
      await this.setChannelDescription(server, channelId, roomCode);
      await this.kv.set(key, String(channelId));
      return channelId;
    } catch (err) {
      console.warn(`[voice] Failed to ensure Mumble channel for room ${roomCode}:`, err);
      return null;
    }
  }

  async getRoomChannel(roomCode: string): Promise<number | null> {
    if (!this.enabled) return null;

    const existing = await this.kv.get(this.roomChannelKey(roomCode));
    if (!existing) return this.ensureRoomChannel(roomCode);

    const channelId = Number(existing);
    if (!Number.isInteger(channelId)) return this.ensureRoomChannel(roomCode);
    if (await this.channelExists(channelId)) return channelId;
    return this.ensureRoomChannel(roomCode);
  }

  async deleteRoomChannel(roomCode: string): Promise<void> {
    if (!this.enabled) return;

    const key = this.roomChannelKey(roomCode);
    const existing = await this.kv.get(key);
    await this.kv.del(key);
    if (!existing) return;

    const channelId = Number(existing);
    if (!Number.isInteger(channelId) || channelId <= 0) return;

    try {
      const server = await this.getServer();
      await server.removeChannel(channelId, this.context());
    } catch (err) {
      console.warn(`[voice] Failed to remove Mumble channel ${channelId} for room ${roomCode}:`, err);
    }
  }

  async reconcileActiveRooms(): Promise<void> {
    if (!this.enabled) return;

    const roomKeys = (await this.kv.keys('room:*')).filter(k => !k.includes(':players') && !k.includes(':state'));
    await Promise.all(roomKeys.map((key) => this.ensureRoomChannel(key.replace('room:', ''))));
  }

  async close(): Promise<void> {
    const communicator = this.communicator;
    this.communicator = null;
    this.meta = null;
    if (communicator) {
      await communicator.destroy();
    }
  }

  async clearRoomChannelMapping(roomCode: string): Promise<void> {
    await this.kv.del(this.roomChannelKey(roomCode));
  }

  private async getServer(): Promise<MumbleServer.ServerPrx> {
    const meta = this.getMeta();
    const server = await meta.getServer(this.config.serverId, this.context());
    if (!server) {
      throw new Error(`Mumble virtual server ${this.config.serverId} not found`);
    }
    return server;
  }

  private getMeta(): MumbleServer.MetaPrx {
    if (!this.communicator) {
      this.communicator = Ice.initialize();
    }
    if (!this.meta) {
      this.meta = new MumbleServer.MetaPrx(this.communicator, `Meta:tcp -h ${this.config.host} -p ${this.config.port}`);
    }
    return this.meta;
  }

  private async channelExists(channelId: number): Promise<boolean> {
    try {
      const server = await this.getServer();
      await server.getChannelState(channelId, this.context());
      return true;
    } catch {
      return false;
    }
  }

  private async setChannelDescription(server: MumbleServer.ServerPrx, channelId: number, roomCode: string): Promise<void> {
    try {
      const channel = await server.getChannelState(channelId, this.context());
      channel.description = `UNO Online 房间 ${roomCode}`;
      await server.setChannelState(channel, this.context());
    } catch (err) {
      console.warn(`[voice] Failed to set Mumble channel description for room ${roomCode}:`, err);
    }
  }

  private roomChannelKey(roomCode: string): string {
    return `${VOICE_CHANNEL_KEY_PREFIX}${roomCode}:channelId`;
  }

  private roomChannelName(roomCode: string): string {
    return `${this.config.channelNamePrefix}${roomCode}`;
  }

  private context(): Map<string, string> | undefined {
    return this.config.secret ? new Map([['secret', this.config.secret]]) : undefined;
  }
}

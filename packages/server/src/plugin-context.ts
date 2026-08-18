import type { Kysely } from 'kysely';
import type { RoomDissolveReason } from '@uno-online/shared';
import type { Database } from './db/database.js';
import type { KvStore } from './kv/types.js';
import type { Config } from './config.js';
import type { UnoServer as SocketIOServer } from './ws/types.js';

export interface PluginContext {
  db: Kysely<Database>;
  kv: KvStore;
  io: SocketIOServer;
  config: Config;
  /** Assigned after the websocket runtime owns the live session/timer maps. */
  dissolveRoom?: (roomCode: string, reason?: RoomDissolveReason) => Promise<void>;
}

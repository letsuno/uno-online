import type { Kysely } from 'kysely';
import type { Server as SocketIOServer } from 'socket.io';
import type { Database } from './db/database.js';
import type { KvStore } from './kv/types.js';
import type { Config } from './config.js';

export interface PluginContext {
  db: Kysely<Database>;
  kv: KvStore;
  io: SocketIOServer;
  config: Config;
}

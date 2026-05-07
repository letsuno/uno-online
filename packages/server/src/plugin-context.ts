import type { Kysely } from 'kysely';
import type { Server as SocketIOServer } from 'socket.io';
import type { Database } from './db/database';
import type { KvStore } from './kv/types';
import type { Config } from './config';

export interface PluginContext {
  db: Kysely<Database>;
  kv: KvStore;
  io: SocketIOServer;
  config: Config;
}

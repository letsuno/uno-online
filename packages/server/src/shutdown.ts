interface ClosableServer {
  close(): Promise<unknown>;
}

interface ShutdownDriver {
  beginShutdown(): void;
  drain(): Promise<void>;
}

interface SnapshotPersister {
  flushAll(): Promise<void>;
}

interface AsyncCloser {
  close(): Promise<unknown>;
}

interface DisconnectableStore {
  disconnect(): Promise<void>;
}

export interface ServerShutdownResources {
  fastify: ClosableServer;
  driver: ShutdownDriver;
  persister: SnapshotPersister;
  voiceChannels: AsyncCloser;
  closeDatabase(): Promise<void>;
  kv: DisconnectableStore;
}

/**
 * Stop mutation producers, close transports, drain admitted work, then persist
 * the final authoritative state before tearing down external dependencies.
 */
export async function shutdownServer(resources: ServerShutdownResources): Promise<void> {
  resources.driver.beginShutdown();
  await resources.persister.flushAll();
  await resources.fastify.close();
  await resources.driver.drain();
  await resources.persister.flushAll();
  await resources.voiceChannels.close();
  await resources.closeDatabase();
  await resources.kv.disconnect();
}

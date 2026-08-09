import type { KvStore } from './types.js';
import { MemoryKvStore } from './memory.js';
import { NamespacedKvStore } from './namespaced.js';
import { RedisKvStore } from './redis.js';

/**
 * Create a KvStore based on an already-validated config. A missing URL uses
 * memory only for callers that explicitly allow development/test storage.
 */
export function createKvStore(redisUrl: string | undefined, namespace: string): KvStore {
  const store = redisUrl ? new RedisKvStore(redisUrl) : new MemoryKvStore();
  return new NamespacedKvStore(store, namespace);
}

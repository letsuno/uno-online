import type { KvStore } from './types.js';
import { MemoryKvStore } from './memory.js';
import { NamespacedKvStore } from './namespaced.js';
import { RedisKvStore } from './redis.js';

const RUNTIME_NAMESPACE = 'uno:runtime';

/**
 * Create a KvStore based on an already-validated config. A missing URL uses
 * memory only for callers that explicitly allow development/test storage.
 */
export function createKvStore(redisUrl: string | undefined): KvStore {
  const store = redisUrl ? new RedisKvStore(redisUrl) : new MemoryKvStore();
  return new NamespacedKvStore(store, RUNTIME_NAMESPACE);
}

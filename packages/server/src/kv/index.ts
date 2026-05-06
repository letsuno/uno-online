export type { KvStore } from './types.js';
export { MemoryKvStore } from './memory.js';
export { RedisKvStore } from './redis.js';

import type { KvStore } from './types.js';
import { MemoryKvStore } from './memory.js';
import { RedisKvStore } from './redis.js';

/**
 * Create a KvStore based on config.
 * If redisUrl is provided, uses Redis; otherwise falls back to in-memory.
 */
export function createKvStore(redisUrl?: string): KvStore {
  if (redisUrl) {
    return new RedisKvStore(redisUrl);
  }
  return new MemoryKvStore();
}

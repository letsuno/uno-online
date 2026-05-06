import Redis from 'ioredis';
import type { KvStore } from './types.js';

/**
 * Redis-backed KV store.
 */
export class RedisKvStore implements KvStore {
  private client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, { maxRetriesPerRequest: 3 });
  }

  async get(key: string) {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(...keys: string[]) {
    if (keys.length > 0) await this.client.del(...keys);
  }

  async expire(key: string, ttlSeconds: number) {
    await this.client.expire(key, ttlSeconds);
  }

  async hset(key: string, fields: Record<string, string>) {
    await this.client.hset(key, fields);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async rpush(key: string, ...values: string[]) {
    await this.client.rpush(key, ...values);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lrange(key, start, stop);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  async disconnect() {
    await this.client.quit();
  }
}

import { Redis } from 'ioredis';
import type { KvStore, KvStringBatchOperation } from './types.js';

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

  async setIfAbsent(key: string, value: string) {
    return (await this.client.set(key, value, 'NX')) === 'OK';
  }

  async del(...keys: string[]) {
    if (keys.length > 0) await this.client.del(...keys);
  }

  async batchStrings(operations: readonly KvStringBatchOperation[]) {
    if (operations.length === 0) return;

    const transaction = this.client.multi();
    for (const operation of operations) {
      if (operation.type === 'set') transaction.set(operation.key, operation.value);
      else transaction.del(operation.key);
    }
    const results = await transaction.exec();
    if (results === null) throw new Error('Redis string batch transaction was aborted');
    const commandError = results.find(([error]) => error !== null)?.[0];
    if (commandError) throw commandError;
  }

  async compareAndDelete(key: string, expectedValue: string) {
    const deleted = await this.client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      expectedValue,
    );
    return deleted === 1;
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

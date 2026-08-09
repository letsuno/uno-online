import type { KvStore, KvStringBatchOperation } from './types.js';

const INVALID_NAMESPACE_CHARS = /[*?[\]]/u;

/**
 * Isolates volatile runtime state by schema generation without teaching
 * individual room/game stores about deployment history.
 *
 * A state-compatible release keeps the same namespace. A breaking release
 * selects a new namespace and leaves the old generation unreachable until it
 * can be deleted after its rooms have drained.
 */
export class NamespacedKvStore implements KvStore {
  private readonly prefix: string;

  constructor(
    private readonly inner: KvStore,
    namespace: string,
  ) {
    const normalized = namespace.trim().replace(/:+$/u, '');
    if (!normalized || INVALID_NAMESPACE_CHARS.test(normalized)) {
      throw new Error('KV namespace must be non-empty and must not contain glob characters');
    }
    this.prefix = `${normalized}:`;
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<string | null> {
    return this.inner.get(this.key(key));
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.inner.set(this.key(key), value, ttlSeconds);
  }

  async setIfAbsent(key: string, value: string): Promise<boolean> {
    return this.inner.setIfAbsent(this.key(key), value);
  }

  async del(...keys: string[]): Promise<void> {
    await this.inner.del(...keys.map(key => this.key(key)));
  }

  async batchStrings(operations: readonly KvStringBatchOperation[]): Promise<void> {
    await this.inner.batchStrings(
      operations.map(operation => ({
        ...operation,
        key: this.key(operation.key),
      })),
    );
  }

  async compareAndDelete(key: string, expectedValue: string): Promise<boolean> {
    return this.inner.compareAndDelete(this.key(key), expectedValue);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.inner.expire(this.key(key), ttlSeconds);
  }

  async hset(key: string, fields: Record<string, string>): Promise<void> {
    await this.inner.hset(this.key(key), fields);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.inner.hgetall(this.key(key));
  }

  async rpush(key: string, ...values: string[]): Promise<void> {
    await this.inner.rpush(this.key(key), ...values);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.inner.lrange(this.key(key), start, stop);
  }

  async keys(pattern: string): Promise<string[]> {
    const keys = await this.inner.keys(this.key(pattern));
    return keys.filter(key => key.startsWith(this.prefix)).map(key => key.slice(this.prefix.length));
  }

  async disconnect(): Promise<void> {
    await this.inner.disconnect();
  }
}

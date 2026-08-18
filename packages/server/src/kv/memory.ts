import type { KvStore, KvStringBatchOperation } from './types.js';

/**
 * In-memory KV store for development / single-instance deployments without Redis.
 */
export class MemoryKvStore implements KvStore {
  private strings = new Map<string, string>();
  private hashes = new Map<string, Map<string, string>>();
  private lists = new Map<string, string[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  private clearKey(key: string) {
    this.strings.delete(key);
    this.hashes.delete(key);
    this.lists.delete(key);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  private setTTL(key: string, seconds: number) {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    // clearTimeout cannot retract a callback that has already entered the
    // event queue. Bind expiry to the handle that armed it so an old TTL
    // callback cannot delete a value whose lifetime was just refreshed.
    const timer = setTimeout(() => {
      if (this.timers.get(key) !== timer) return;
      this.clearKey(key);
    }, seconds * 1000);
    this.timers.set(key, timer);
  }

  async get(key: string) {
    if (this.hashes.has(key) || this.lists.has(key)) {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    this.hashes.delete(key);
    this.lists.delete(key);
    this.strings.set(key, value);
    if (ttlSeconds) {
      this.setTTL(key, ttlSeconds);
    } else {
      // Match Redis SET semantics: writing without EX makes the new value
      // persistent and invalidates any expiry owned by the previous value.
      const existing = this.timers.get(key);
      if (existing) clearTimeout(existing);
      this.timers.delete(key);
    }
  }

  async setIfAbsent(key: string, value: string) {
    if (this.strings.has(key) || this.hashes.has(key) || this.lists.has(key)) return false;
    this.strings.set(key, value);
    return true;
  }

  async del(...keys: string[]) {
    for (const k of keys) this.clearKey(k);
  }

  async batchStrings(operations: readonly KvStringBatchOperation[]) {
    // There is no await in this loop, so other callers and timer callbacks
    // cannot observe a partially applied in-memory batch.
    for (const operation of operations) {
      const timer = this.timers.get(operation.key);
      if (timer) clearTimeout(timer);
      this.timers.delete(operation.key);
      this.hashes.delete(operation.key);
      this.lists.delete(operation.key);
      if (operation.type === 'set') {
        this.strings.set(operation.key, operation.value);
      } else {
        this.strings.delete(operation.key);
      }
    }
  }

  async compareAndDelete(key: string, expectedValue: string) {
    if (this.strings.get(key) !== expectedValue) return false;
    this.clearKey(key);
    return true;
  }

  async expire(key: string, ttlSeconds: number) {
    // Only set TTL if key exists somewhere
    if (this.strings.has(key) || this.hashes.has(key) || this.lists.has(key)) {
      this.setTTL(key, ttlSeconds);
    }
  }

  async hset(key: string, fields: Record<string, string>) {
    if (this.strings.has(key) || this.lists.has(key)) {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    let map = this.hashes.get(key);
    if (!map) {
      map = new Map();
      this.hashes.set(key, map);
    }
    for (const [f, v] of Object.entries(fields)) map.set(f, v);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (this.strings.has(key) || this.lists.has(key)) {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    const map = this.hashes.get(key);
    if (!map) return {};
    return Object.fromEntries(map);
  }

  async rpush(key: string, ...values: string[]) {
    if (this.strings.has(key) || this.hashes.has(key)) {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    let list = this.lists.get(key);
    if (!list) {
      list = [];
      this.lists.set(key, list);
    }
    list.push(...values);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (this.strings.has(key) || this.hashes.has(key)) {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    const list = this.lists.get(key) ?? [];
    const end = stop < 0 ? list.length + stop + 1 : stop + 1;
    return list.slice(start, end);
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    const all = new Set<string>([...this.strings.keys(), ...this.hashes.keys(), ...this.lists.keys()]);
    return [...all].filter(k => regex.test(k));
  }

  async disconnect() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.strings.clear();
    this.hashes.clear();
    this.lists.clear();
  }
}

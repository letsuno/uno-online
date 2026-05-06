import type { KvStore } from './types.js';

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
    if (timer) { clearTimeout(timer); this.timers.delete(key); }
  }

  private setTTL(key: string, seconds: number) {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(key, setTimeout(() => this.clearKey(key), seconds * 1000));
  }

  async get(key: string) {
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    this.strings.set(key, value);
    if (ttlSeconds) this.setTTL(key, ttlSeconds);
  }

  async del(...keys: string[]) {
    for (const k of keys) this.clearKey(k);
  }

  async expire(key: string, ttlSeconds: number) {
    // Only set TTL if key exists somewhere
    if (this.strings.has(key) || this.hashes.has(key) || this.lists.has(key)) {
      this.setTTL(key, ttlSeconds);
    }
  }

  async hset(key: string, fields: Record<string, string>) {
    let map = this.hashes.get(key);
    if (!map) { map = new Map(); this.hashes.set(key, map); }
    for (const [f, v] of Object.entries(fields)) map.set(f, v);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const map = this.hashes.get(key);
    if (!map) return {};
    return Object.fromEntries(map);
  }

  async rpush(key: string, ...values: string[]) {
    let list = this.lists.get(key);
    if (!list) { list = []; this.lists.set(key, list); }
    list.push(...values);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) ?? [];
    const end = stop < 0 ? list.length + stop + 1 : stop + 1;
    return list.slice(start, end);
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    const all = new Set<string>([
      ...this.strings.keys(),
      ...this.hashes.keys(),
      ...this.lists.keys(),
    ]);
    return [...all].filter((k) => regex.test(k));
  }

  async disconnect() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.strings.clear();
    this.hashes.clear();
    this.lists.clear();
  }
}

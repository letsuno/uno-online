/**
 * Minimal KV store interface covering the operations used by room-store and game-store.
 */
export type KvStringBatchOperation = { type: 'set'; key: string; value: string } | { type: 'del'; key: string };

export interface KvStore {
  // String ops
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** Set a string only when the key does not already exist. */
  setIfAbsent(key: string, value: string): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  /** Commit string SET/DEL operations as one all-or-nothing mutation. */
  batchStrings(operations: readonly KvStringBatchOperation[]): Promise<void>;
  compareAndDelete(key: string, expectedValue: string): Promise<boolean>;
  expire(key: string, ttlSeconds: number): Promise<void>;

  // Hash ops
  hset(key: string, fields: Record<string, string>): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;

  // List ops
  rpush(key: string, ...values: string[]): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;

  // Key pattern ops
  keys(pattern: string): Promise<string[]>;

  // Lifecycle
  disconnect(): Promise<void>;
}

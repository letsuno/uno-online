import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory.js';

describe('MemoryKvStore TTL ownership', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores an expired callback after the same key receives a fresh TTL', async () => {
    const callbacks: Array<() => void> = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      callbacks.push(callback);
      return callbacks.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    // Model the real boundary where the old callback is already queued and
    // therefore cannot be withdrawn by clearTimeout.
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => undefined);

    const kv = new MemoryKvStore();
    await kv.set('room:ABC123', 'old', 1);
    await kv.set('room:ABC123', 'fresh', 1);

    callbacks[0]!();
    expect(await kv.get('room:ABC123')).toBe('fresh');

    callbacks[1]!();
    expect(await kv.get('room:ABC123')).toBeNull();
  });

  it('invalidates an old TTL when the replacement is persistent', async () => {
    const callbacks: Array<() => void> = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      callbacks.push(callback);
      return callbacks.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => undefined);

    const kv = new MemoryKvStore();
    await kv.set('user:one:room', 'OLD123', 1);
    await kv.set('user:one:room', 'NEW456');

    callbacks[0]!();
    expect(await kv.get('user:one:room')).toBe('NEW456');
  });
});

describe('MemoryKvStore string batches', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes SET and DEL together and detaches their old TTL callbacks', async () => {
    const callbacks: Array<() => void> = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      callbacks.push(callback);
      return callbacks.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => undefined);

    const kv = new MemoryKvStore();
    await kv.set('room:ABC123:seats', 'old-seats', 1);
    await kv.set('room:ABC123:spectators', 'old-spectators', 1);
    await kv.batchStrings([
      { type: 'set', key: 'room:ABC123:seats', value: 'new-seats' },
      { type: 'del', key: 'room:ABC123:spectators' },
    ]);

    callbacks[0]!();
    callbacks[1]!();
    expect(await kv.get('room:ABC123:seats')).toBe('new-seats');
    expect(await kv.get('room:ABC123:spectators')).toBeNull();
  });
});

describe('MemoryKvStore string type replacement', () => {
  it('replaces hashes and lists when SET writes the same key', async () => {
    const kv = new MemoryKvStore();
    await kv.hset('shared-key', { field: 'value' });
    await kv.set('shared-key', 'after-hash');
    expect(await kv.get('shared-key')).toBe('after-hash');
    await expect(kv.hgetall('shared-key')).rejects.toThrow('WRONGTYPE');

    await kv.rpush('list-key', 'list-value');
    await kv.set('list-key', 'after-list');
    expect(await kv.get('list-key')).toBe('after-list');
    await expect(kv.lrange('list-key', 0, -1)).rejects.toThrow('WRONGTYPE');
    await kv.disconnect();
  });

  it('matches Redis read behavior for missing and wrong-type keys', async () => {
    const kv = new MemoryKvStore();
    expect(await kv.hgetall('missing')).toEqual({});
    expect(await kv.lrange('missing', 0, -1)).toEqual([]);

    await kv.set('string-key', 'value');
    await expect(kv.hgetall('string-key')).rejects.toThrow('WRONGTYPE');
    await expect(kv.lrange('string-key', 0, -1)).rejects.toThrow('WRONGTYPE');

    await kv.hset('hash-key', { field: 'value' });
    await expect(kv.get('hash-key')).rejects.toThrow('WRONGTYPE');
    await expect(kv.lrange('hash-key', 0, -1)).rejects.toThrow('WRONGTYPE');

    await kv.rpush('list-key', 'value');
    await expect(kv.get('list-key')).rejects.toThrow('WRONGTYPE');
    await expect(kv.hgetall('list-key')).rejects.toThrow('WRONGTYPE');
    await kv.disconnect();
  });

  it('rejects HSET and RPUSH against a key owned by another data type', async () => {
    const kv = new MemoryKvStore();
    await kv.set('string-key', 'value');
    await expect(kv.hset('string-key', { field: 'value' })).rejects.toThrow('WRONGTYPE');
    await expect(kv.rpush('string-key', 'value')).rejects.toThrow('WRONGTYPE');

    await kv.hset('hash-key', { field: 'value' });
    await expect(kv.rpush('hash-key', 'value')).rejects.toThrow('WRONGTYPE');
    await kv.rpush('list-key', 'value');
    await expect(kv.hset('list-key', { field: 'value' })).rejects.toThrow('WRONGTYPE');
    await kv.disconnect();
  });
});

describe('MemoryKvStore conditional strings', () => {
  it('sets only an absent key and preserves an existing value', async () => {
    const kv = new MemoryKvStore();

    await expect(kv.setIfAbsent('user:one:room', 'OLD123')).resolves.toBe(true);
    await expect(kv.setIfAbsent('user:one:room', 'NEW456')).resolves.toBe(false);
    expect(await kv.get('user:one:room')).toBe('OLD123');

    await kv.disconnect();
  });
});

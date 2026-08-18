import { describe, expect, it } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory.js';
import { NamespacedKvStore } from '../../src/kv/namespaced.js';

describe('NamespacedKvStore', () => {
  it('isolates logical stores and hides their physical prefixes', async () => {
    const inner = new MemoryKvStore();
    const runtime = new NamespacedKvStore(inner, 'uno:runtime');
    const other = new NamespacedKvStore(inner, 'other:runtime');

    await runtime.set('room:ABC123:seats', 'uno');
    await other.set('room:ABC123:seats', 'other');

    expect(await runtime.get('room:ABC123:seats')).toBe('uno');
    expect(await other.get('room:ABC123:seats')).toBe('other');
    expect(await runtime.keys('room:*')).toEqual(['room:ABC123:seats']);
    expect(await inner.get('uno:runtime:room:ABC123:seats')).toBe('uno');
  });

  it('prefixes every key in an atomic string batch', async () => {
    const inner = new MemoryKvStore();
    const kv = new NamespacedKvStore(inner, 'uno:runtime');

    await kv.batchStrings([
      { type: 'set', key: 'room:ABC123:seats', value: 'seats' },
      { type: 'set', key: 'room:ABC123:spectators', value: 'spectators' },
    ]);
    await kv.batchStrings([{ type: 'del', key: 'room:ABC123:spectators' }]);

    expect(await inner.get('uno:runtime:room:ABC123:seats')).toBe('seats');
    expect(await inner.get('uno:runtime:room:ABC123:spectators')).toBeNull();
  });

  it('rejects namespaces that could escape key-pattern isolation', () => {
    const inner = new MemoryKvStore();
    expect(() => new NamespacedKvStore(inner, 'uno:*')).toThrow('glob characters');
  });
});

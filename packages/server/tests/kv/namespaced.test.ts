import { describe, expect, it } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory.js';
import { NamespacedKvStore } from '../../src/kv/namespaced.js';

describe('NamespacedKvStore', () => {
  it('isolates runtime schema generations and hides the physical prefix', async () => {
    const inner = new MemoryKvStore();
    const v1 = new NamespacedKvStore(inner, 'uno:runtime:v1');
    const v2 = new NamespacedKvStore(inner, 'uno:runtime:v2');

    await v1.set('room:ABC123:seats', 'v1');
    await v2.set('room:ABC123:seats', 'v2');

    expect(await v1.get('room:ABC123:seats')).toBe('v1');
    expect(await v2.get('room:ABC123:seats')).toBe('v2');
    expect(await v1.keys('room:*')).toEqual(['room:ABC123:seats']);
    expect(await inner.get('uno:runtime:v1:room:ABC123:seats')).toBe('v1');
  });

  it('prefixes every key in an atomic string batch', async () => {
    const inner = new MemoryKvStore();
    const kv = new NamespacedKvStore(inner, 'uno:runtime:v3');

    await kv.batchStrings([
      { type: 'set', key: 'room:ABC123:seats', value: 'seats' },
      { type: 'set', key: 'room:ABC123:spectators', value: 'spectators' },
    ]);
    await kv.batchStrings([{ type: 'del', key: 'room:ABC123:spectators' }]);

    expect(await inner.get('uno:runtime:v3:room:ABC123:seats')).toBe('seats');
    expect(await inner.get('uno:runtime:v3:room:ABC123:spectators')).toBeNull();
  });

  it('rejects namespaces that could escape key-pattern isolation', () => {
    const inner = new MemoryKvStore();
    expect(() => new NamespacedKvStore(inner, 'uno:*')).toThrow('glob characters');
  });
});

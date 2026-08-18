import { describe, expect, it } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory.js';
import { NamespacedKvStore } from '../../src/kv/namespaced.js';
import { initializeRuntimeState, RUNTIME_STATE_GENERATION } from '../../src/kv/runtime-state.js';
import type { KvStringBatchOperation } from '../../src/kv/types.js';

class FailingBatchKvStore extends MemoryKvStore {
  override async batchStrings(_operations: readonly KvStringBatchOperation[]): Promise<void> {
    throw new Error('injected runtime reset failure');
  }
}

function createRuntimeStore() {
  return new NamespacedKvStore(new MemoryKvStore(), 'uno:runtime');
}

describe('runtime state initialization', () => {
  it('preserves compatible runtime data across restarts', async () => {
    const kv = createRuntimeStore();
    expect(await initializeRuntimeState(kv)).toBe(false);
    await kv.set('room:ABC123', 'room-data');

    expect(await initializeRuntimeState(kv)).toBe(false);
    expect(await kv.get('room:ABC123')).toBe('room-data');
  });

  it('atomically clears incompatible runtime data and records the code generation', async () => {
    const kv = createRuntimeStore();
    await kv.set('meta:runtime-generation', 'older');
    await kv.set('room:ABC123', 'room-data');
    await kv.hset('room:ABC123:voice', { user: 'connected' });
    await kv.rpush('room:ABC123:chat', 'message');

    expect(await initializeRuntimeState(kv)).toBe(true);
    expect(await kv.keys('*')).toEqual(['meta:runtime-generation']);
    expect(await kv.get('meta:runtime-generation')).toBe(String(RUNTIME_STATE_GENERATION));
  });

  it('fails initialization without partially clearing state when the reset transaction fails', async () => {
    const backend = new FailingBatchKvStore();
    const kv = new NamespacedKvStore(backend, 'uno:runtime');
    await kv.set('meta:runtime-generation', 'older');
    await kv.set('room:ABC123', 'room-data');

    await expect(initializeRuntimeState(kv)).rejects.toThrow('injected runtime reset failure');
    expect(await kv.get('meta:runtime-generation')).toBe('older');
    expect(await kv.get('room:ABC123')).toBe('room-data');
  });
});

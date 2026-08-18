import type { KvStore } from './types.js';

const GENERATION_KEY = 'meta:runtime-generation';

/**
 * Increment in the same change that makes persisted room/game state
 * incompatible. Startup clears the fixed runtime namespace exactly once for
 * the new generation; compatible restarts preserve it.
 */
export const RUNTIME_STATE_GENERATION = 1 as const;

export async function initializeRuntimeState(kv: KvStore): Promise<boolean> {
  const expectedGeneration = String(RUNTIME_STATE_GENERATION);
  if ((await kv.get(GENERATION_KEY)) === expectedGeneration) return false;

  const keys = await kv.keys('*');
  await kv.batchStrings([
    ...keys.map(key => ({ type: 'del' as const, key })),
    { type: 'set', key: GENERATION_KEY, value: expectedGeneration },
  ]);
  return keys.length > 0;
}

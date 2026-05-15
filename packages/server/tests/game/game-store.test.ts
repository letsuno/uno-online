import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import { saveGameState, loadGameState } from '../../src/plugins/core/game/state-store';
import { GameSession } from '../../src/plugins/core/game/session';

const kv = new MemoryKvStore();
const TEST_CODE = 'GTEST1';

beforeEach(async () => {
  const keys = await kv.keys(`game:${TEST_CODE}*`);
  if (keys.length > 0) await kv.del(...keys);
});

afterAll(async () => {
  await kv.disconnect();
});

describe('game-store', () => {
  it('saves and loads game state', async () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);
    await saveGameState(kv, TEST_CODE, session.getFullState());
    const loaded = await loadGameState(kv, TEST_CODE);
    expect(loaded).not.toBeNull();
    expect(loaded!.players).toHaveLength(2);
    expect(loaded!.players[0]!.hand.length).toBeGreaterThanOrEqual(7);
  });

  it('returns null for non-existent game', async () => {
    const loaded = await loadGameState(kv, 'NONEXIST');
    expect(loaded).toBeNull();
  });

  it('deletes game state via kv.del', async () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);
    await saveGameState(kv, TEST_CODE, session.getFullState());
    await kv.del(`game:${TEST_CODE}:state`);
    const loaded = await loadGameState(kv, TEST_CODE);
    expect(loaded).toBeNull();
  });
});

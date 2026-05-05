import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Redis from 'ioredis';
import { saveGameState, loadGameState, deleteGameState } from '../../src/game/game-store.js';
import { GameSession } from '../../src/game/game-session.js';

const redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
const TEST_CODE = 'GTEST1';

beforeEach(async () => {
  const keys = await redis.keys(`game:${TEST_CODE}*`);
  if (keys.length > 0) await redis.del(...keys);
});

afterAll(async () => {
  const keys = await redis.keys(`game:${TEST_CODE}*`);
  if (keys.length > 0) await redis.del(...keys);
  await redis.quit();
});

describe('game-store', () => {
  it('saves and loads game state', async () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);
    await saveGameState(redis, TEST_CODE, session.getFullState());
    const loaded = await loadGameState(redis, TEST_CODE);
    expect(loaded).not.toBeNull();
    expect(loaded!.players).toHaveLength(2);
    expect(loaded!.players[0]!.hand.length).toBeGreaterThanOrEqual(7);
  });

  it('returns null for non-existent game', async () => {
    const loaded = await loadGameState(redis, 'NONEXIST');
    expect(loaded).toBeNull();
  });

  it('deletes game state', async () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);
    await saveGameState(redis, TEST_CODE, session.getFullState());
    await deleteGameState(redis, TEST_CODE);
    const loaded = await loadGameState(redis, TEST_CODE);
    expect(loaded).toBeNull();
  });
});

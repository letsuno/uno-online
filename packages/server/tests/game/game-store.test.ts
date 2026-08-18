import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { MemoryKvStore } from '../../src/kv/memory';
import {
  deleteGameState,
  GameStateCorruptionError,
  GameStatePersister,
  loadGameState,
  loadGameStateForRestore,
  saveGameState,
} from '../../src/plugins/core/game/state-store';
import { GameSession } from '../../src/plugins/core/game/session';
import { TEST_ROOM_SETTINGS } from '../helpers/test-utils';
import {
  clearNextRoundExclusions,
  excludeFromNextRound,
  isNextRoundExcluded,
} from '../../src/plugins/core/game/lifecycle-state';

const kv = new MemoryKvStore();
const TEST_CODE = 'GTEST1';

function createSession(): GameSession {
  return GameSession.create(
    [
      { id: 'p1', name: 'Alice', avatarUrl: null, role: 'normal', isBot: false },
      { id: 'p2', name: 'Bob', avatarUrl: null, role: 'normal', isBot: false },
    ],
    TEST_ROOM_SETTINGS,
  );
}

beforeEach(async () => {
  const keys = await kv.keys(`game:${TEST_CODE}*`);
  if (keys.length > 0) await kv.del(...keys);
  clearNextRoundExclusions(TEST_CODE);
});

afterAll(async () => {
  await kv.disconnect();
});

describe('game-store', () => {
  it('saves and loads game state', async () => {
    const session = createSession();
    await saveGameState(kv, TEST_CODE, session.getFullState());
    const loaded = await loadGameState(kv, TEST_CODE);
    expect(loaded).not.toBeNull();
    expect(loaded!.players).toHaveLength(2);
    expect(loaded!.players[0]!.hand.length).toBeGreaterThanOrEqual(7);

    const raw = JSON.parse((await kv.get(`game:${TEST_CODE}:state`))!);
    expect(raw).toMatchObject({
      lifecycle: { excludedFromNextRound: [] },
    });
    expect(raw).not.toHaveProperty('snapshotVersion');
  });

  it('restores next-round exclusions from the same current snapshot', async () => {
    const session = createSession();
    excludeFromNextRound(TEST_CODE, 'p2');
    await saveGameState(kv, TEST_CODE, session.getFullState());

    clearNextRoundExclusions(TEST_CODE);
    expect(isNextRoundExcluded(TEST_CODE, 'p2')).toBe(false);
    expect(await loadGameStateForRestore(kv, TEST_CODE)).not.toBeNull();
    expect(isNextRoundExcluded(TEST_CODE, 'p2')).toBe(true);
  });

  it('does not let a read-only snapshot load overwrite newer live lifecycle state', async () => {
    const session = createSession();
    await saveGameState(kv, TEST_CODE, session.getFullState());
    excludeFromNextRound(TEST_CODE, 'p2');

    expect(await loadGameState(kv, TEST_CODE)).not.toBeNull();
    expect(isNextRoundExcluded(TEST_CODE, 'p2')).toBe(true);
  });

  it('rejects a bare game state without the current snapshot envelope', async () => {
    const session = createSession();
    excludeFromNextRound(TEST_CODE, 'p2');
    await kv.set(`game:${TEST_CODE}:state`, JSON.stringify(session.getFullState()));

    await expect(loadGameStateForRestore(kv, TEST_CODE)).rejects.toBeInstanceOf(GameStateCorruptionError);
    expect(isNextRoundExcluded(TEST_CODE, 'p2')).toBe(true);
  });

  it('rejects a snapshot without the complete lifecycle shape', async () => {
    const session = createSession();
    await kv.set(
      `game:${TEST_CODE}:state`,
      JSON.stringify({
        gameState: session.getFullState(),
        lifecycle: { excludedFromNextRound: [] },
      }),
    );

    await expect(loadGameState(kv, TEST_CODE)).rejects.toBeInstanceOf(GameStateCorruptionError);
  });

  it('rejects malformed pending spectator lifecycle entries', async () => {
    const session = createSession();
    await kv.set(
      `game:${TEST_CODE}:state`,
      JSON.stringify({
        gameState: session.getFullState(),
        lifecycle: {
          excludedFromNextRound: [],
          pendingSpectatorJoins: [{ userId: 'watcher' }],
        },
      }),
    );

    await expect(loadGameStateForRestore(kv, TEST_CODE)).rejects.toBeInstanceOf(GameStateCorruptionError);
  });

  it('classifies malformed exclusion metadata as snapshot corruption', async () => {
    const session = createSession();
    await kv.set(
      `game:${TEST_CODE}:state`,
      JSON.stringify({
        gameState: session.getFullState(),
        lifecycle: {
          excludedFromNextRound: {},
          pendingSpectatorJoins: [],
        },
      }),
    );

    await expect(loadGameStateForRestore(kv, TEST_CODE)).rejects.toBeInstanceOf(GameStateCorruptionError);
  });

  it('rejects out-of-domain current room settings in a snapshot', async () => {
    const session = createSession();
    await saveGameState(kv, TEST_CODE, session.getFullState());
    const snapshot = JSON.parse((await kv.get(`game:${TEST_CODE}:state`))!) as {
      gameState: { settings: { houseRules: { handLimit: number | null } } };
    };
    snapshot.gameState.settings.houseRules.handLimit = 16;
    await kv.set(`game:${TEST_CODE}:state`, JSON.stringify(snapshot));

    await expect(loadGameStateForRestore(kv, TEST_CODE)).rejects.toBeInstanceOf(GameStateCorruptionError);
  });

  it.each(['avatarUrl', 'role', 'isBot'])('rejects a current player missing %s', async field => {
    const session = createSession();
    await saveGameState(kv, TEST_CODE, session.getFullState());
    const snapshot = JSON.parse((await kv.get(`game:${TEST_CODE}:state`))!) as {
      gameState: { players: Array<Record<string, unknown>> };
    };
    delete snapshot.gameState.players[0]![field];
    await kv.set(`game:${TEST_CODE}:state`, JSON.stringify(snapshot));

    await expect(loadGameStateForRestore(kv, TEST_CODE)).rejects.toBeInstanceOf(GameStateCorruptionError);
  });

  it('requires botConfig exactly for server-controlled bots in snapshots', async () => {
    const session = createSession();
    await saveGameState(kv, TEST_CODE, session.getFullState());
    const snapshot = JSON.parse((await kv.get(`game:${TEST_CODE}:state`))!) as {
      gameState: { players: Array<Record<string, unknown>> };
    };
    snapshot.gameState.players[0]!['isBot'] = true;
    await kv.set(`game:${TEST_CODE}:state`, JSON.stringify(snapshot));

    await expect(loadGameStateForRestore(kv, TEST_CODE)).rejects.toBeInstanceOf(GameStateCorruptionError);
  });

  it('rejects chat history entries that omit current wire fields', async () => {
    const session = createSession();
    await saveGameState(kv, TEST_CODE, session.getFullState());
    const snapshot = JSON.parse((await kv.get(`game:${TEST_CODE}:state`))!) as {
      gameState: { chatHistory: unknown[] };
    };
    snapshot.gameState.chatHistory = [
      {
        id: 'message-1',
        userId: 'p1',
        nickname: 'Alice',
        text: 'hello',
        timestamp: Date.now(),
      },
    ];
    await kv.set(`game:${TEST_CODE}:state`, JSON.stringify(snapshot));

    await expect(loadGameStateForRestore(kv, TEST_CODE)).rejects.toBeInstanceOf(GameStateCorruptionError);
  });

  it.each([
    ['CATCH_UNO without catcherName', { type: 'CATCH_UNO', catcherId: 'p1', targetId: 'p2' }],
    ['CHALLENGE without its result', { type: 'CHALLENGE', playerId: 'p2' }],
    ['ACCEPT without its result', { type: 'ACCEPT', playerId: 'p2' }],
  ])('rejects an incomplete committed action: %s', async (_label, lastAction) => {
    const session = createSession();
    await saveGameState(kv, TEST_CODE, session.getFullState());
    const snapshot = JSON.parse((await kv.get(`game:${TEST_CODE}:state`))!) as {
      gameState: { lastAction: unknown };
    };
    snapshot.gameState.lastAction = lastAction;
    await kv.set(`game:${TEST_CODE}:state`, JSON.stringify(snapshot));

    await expect(loadGameStateForRestore(kv, TEST_CODE)).rejects.toBeInstanceOf(GameStateCorruptionError);
  });

  it('captures state and lifecycle metadata together when marking a snapshot dirty', async () => {
    const session = createSession();
    const persister = new GameStatePersister(kv);
    excludeFromNextRound(TEST_CODE, 'p2');
    persister.markDirty(TEST_CODE, session.getFullState());
    clearNextRoundExclusions(TEST_CODE);
    await persister.flushNow(TEST_CODE);

    expect(await loadGameStateForRestore(kv, TEST_CODE)).not.toBeNull();
    expect(isNextRoundExcluded(TEST_CODE, 'p2')).toBe(true);
  });

  it('returns null for non-existent game', async () => {
    const loaded = await loadGameState(kv, 'NONEXIST');
    expect(loaded).toBeNull();
  });

  it('deletes game state via kv.del', async () => {
    const session = createSession();
    await saveGameState(kv, TEST_CODE, session.getFullState());
    await kv.del(`game:${TEST_CODE}:state`);
    const loaded = await loadGameState(kv, TEST_CODE);
    expect(loaded).toBeNull();
  });

  it('waits for in-flight writes before cleanup allows the key to be deleted', async () => {
    const store = new BlockingGameStateStore();
    const session = createSession();
    const persister = new GameStatePersister(store);
    const blocked = store.blockNextGameStateWrite();

    persister.markDirty(TEST_CODE, session.getFullState());
    const flush = persister.flushNow(TEST_CODE);
    await blocked.started;

    let cleanupFinished = false;
    const cleanup = persister.cleanup(TEST_CODE).then(() => {
      cleanupFinished = true;
    });
    await Promise.resolve();
    expect(cleanupFinished).toBe(false);

    blocked.release();
    await flush;
    await cleanup;
    await deleteGameState(store, TEST_CODE);
    expect(await loadGameState(store, TEST_CODE)).toBeNull();
    await store.disconnect();
  });

  it('flushes dirty rooms and waits for another room already in flight', async () => {
    const store = new BlockingGameStateStore();
    const persister = new GameStatePersister(store);
    const firstState = createSession().getFullState();
    const secondState = structuredClone(firstState);
    secondState.players[0]!.name = 'Second room';
    const blocked = store.blockNextGameStateWrite('ROOM_B');

    persister.markDirty('ROOM_B', secondState);
    const inFlight = persister.flushNow('ROOM_B');
    await blocked.started;
    persister.markDirty('ROOM_A', firstState);

    let drainFinished = false;
    const drain = persister.flushAll().then(() => {
      drainFinished = true;
    });
    await Promise.resolve();
    expect(drainFinished).toBe(false);

    blocked.release();
    await Promise.all([inFlight, drain]);
    expect((await loadGameState(store, 'ROOM_A'))?.players[0]?.name).toBe('Alice');
    expect((await loadGameState(store, 'ROOM_B'))?.players[0]?.name).toBe('Second room');
    await store.disconnect();
  });

  it('restores a failed flush so an explicit retry can persist it', async () => {
    const store = new FailingGameStateStore(1);
    const session = createSession();
    const persister = new GameStatePersister(store);
    persister.markDirty(TEST_CODE, session.getFullState());

    await expect(persister.flushNow(TEST_CODE)).rejects.toThrow('injected snapshot failure');
    await expect(persister.flushNow(TEST_CODE)).resolves.toBeUndefined();
    expect(await loadGameState(store, TEST_CODE)).not.toBeNull();
    await store.disconnect();
  });

  it('does not retry a stale failed snapshot over a newer queued write', async () => {
    vi.useFakeTimers();
    const store = new SlowFailingGameStateStore();
    const session = createSession();
    const olderState = structuredClone(session.getFullState());
    const newerState = structuredClone(session.getFullState());
    olderState.players[0]!.name = 'A-old';
    newerState.players[0]!.name = 'B-new';
    const persister = new GameStatePersister(store);

    try {
      persister.markDirty(TEST_CODE, olderState);
      const olderFlush = persister.flushNow(TEST_CODE);
      await store.firstWriteStarted;

      persister.markDirty(TEST_CODE, newerState);
      await vi.advanceTimersByTimeAsync(500);
      store.releaseFirstFailure();

      await expect(olderFlush).rejects.toThrow('injected slow snapshot failure');
      await store.newerWriteSaved;
      await vi.advanceTimersByTimeAsync(500);

      expect(store.writeAttempts).toEqual(['A-old', 'B-new']);
      expect((await loadGameState(store, TEST_CODE))!.players[0]!.name).toBe('B-new');
    } finally {
      await persister.cleanup(TEST_CODE);
      vi.useRealTimers();
      await store.disconnect();
    }
  });

  it('backs off failed debounced writes and resets after recovery', async () => {
    vi.useFakeTimers();
    const store = new FailingGameStateStore(2);
    const session = createSession();
    const persister = new GameStatePersister(store);
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => unhandled.push(error);
    process.on('unhandledRejection', onUnhandled);
    try {
      persister.markDirty(TEST_CODE, session.getFullState());
      await vi.advanceTimersByTimeAsync(500);
      expect(store.gameStateWriteAttempts).toBe(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(store.gameStateWriteAttempts).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(store.gameStateWriteAttempts).toBe(2);
      await vi.advanceTimersByTimeAsync(1_999);
      expect(store.gameStateWriteAttempts).toBe(2);
      await vi.advanceTimersByTimeAsync(1);

      expect(unhandled).toEqual([]);
      expect(store.gameStateWriteAttempts).toBe(3);
      expect(await loadGameState(store, TEST_CODE)).not.toBeNull();
    } finally {
      process.off('unhandledRejection', onUnhandled);
      vi.useRealTimers();
      await store.disconnect();
    }
  });

  it('cancels a failed-write retry when cleanup tombstones the room', async () => {
    vi.useFakeTimers();
    const store = new FailingGameStateStore(1);
    const session = createSession();
    const persister = new GameStatePersister(store);
    try {
      persister.markDirty(TEST_CODE, session.getFullState());
      await vi.advanceTimersByTimeAsync(500);
      await persister.cleanup(TEST_CODE);
      await vi.advanceTimersByTimeAsync(2_000);

      expect(store.gameStateWriteAttempts).toBe(1);
      expect(await loadGameState(store, TEST_CODE)).toBeNull();
    } finally {
      vi.useRealTimers();
      await store.disconnect();
    }
  });

  it('releases expired tombstones without another access to the same room', async () => {
    vi.useFakeTimers();
    const persister = new GameStatePersister(kv);
    const tombstones = (
      persister as unknown as {
        dead: Map<string, unknown>;
      }
    ).dead;
    try {
      await persister.cleanup('TOMB_EXPIRE');
      expect(tombstones.has('TOMB_EXPIRE')).toBe(true);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(tombstones.has('TOMB_EXPIRE')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

class FailingGameStateStore extends MemoryKvStore {
  gameStateWriteAttempts = 0;

  constructor(private failuresRemaining: number) {
    super();
  }

  override async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (key === `game:${TEST_CODE}:state`) {
      this.gameStateWriteAttempts += 1;
      if (this.failuresRemaining > 0) {
        this.failuresRemaining -= 1;
        throw new Error('injected snapshot failure');
      }
    }
    await super.set(key, value, ttlSeconds);
  }
}

class BlockingGameStateStore extends MemoryKvStore {
  private blockedWrite: {
    key: string;
    started: () => void;
    wait: Promise<void>;
  } | null = null;

  blockNextGameStateWrite(roomCode = TEST_CODE): { started: Promise<void>; release: () => void } {
    let signalStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => {
      signalStarted = resolve;
    });
    const wait = new Promise<void>(resolve => {
      release = resolve;
    });
    this.blockedWrite = { key: `game:${roomCode}:state`, started: signalStarted, wait };
    return { started, release };
  }

  override async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (key === this.blockedWrite?.key) {
      const blocked = this.blockedWrite;
      this.blockedWrite = null;
      blocked.started();
      await blocked.wait;
    }
    await super.set(key, value, ttlSeconds);
  }
}

class SlowFailingGameStateStore extends MemoryKvStore {
  readonly writeAttempts: string[] = [];
  private firstWrite = true;
  private signalFirstWriteStarted!: () => void;
  private releaseFirstWrite!: () => void;
  private signalNewerWriteSaved!: () => void;
  readonly firstWriteStarted = new Promise<void>(resolve => {
    this.signalFirstWriteStarted = resolve;
  });
  private readonly firstWriteRelease = new Promise<void>(resolve => {
    this.releaseFirstWrite = resolve;
  });
  readonly newerWriteSaved = new Promise<void>(resolve => {
    this.signalNewerWriteSaved = resolve;
  });

  releaseFirstFailure(): void {
    this.releaseFirstWrite();
  }

  override async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (key !== `game:${TEST_CODE}:state`) {
      await super.set(key, value, ttlSeconds);
      return;
    }

    const snapshot = JSON.parse(value) as { gameState: { players: Array<{ name: string }> } };
    const label = snapshot.gameState.players[0]!.name;
    this.writeAttempts.push(label);
    if (this.firstWrite) {
      this.firstWrite = false;
      this.signalFirstWriteStarted();
      await this.firstWriteRelease;
      throw new Error('injected slow snapshot failure');
    }

    await super.set(key, value, ttlSeconds);
    if (label === 'B-new') this.signalNewerWriteSaved();
  }
}

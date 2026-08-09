import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HOUSE_RULES, type GameState } from '@uno-online/shared';
import type { Server as SocketIOServer } from 'socket.io';
import type { KvStore } from '../../src/kv/types';
import type { GameSession } from '../../src/plugins/core/game/session';
import type { GameStatePersister } from '../../src/plugins/core/game/state-store';
import { checkBotJumpIn, checkBotUnoCatch, clearBotTimers } from '../../src/ws/bot-uno-watcher';
import { withRoomLifecycleLock } from '../../src/ws/room-lifecycle-lock';

const TEST_ROOMS = ['UNO_CLEAR', 'UNO_SESSION', 'UNO_TURN', 'UNO_LOCK'] as const;
const io = {} as SocketIOServer;
const redis = {} as KvStore;

function makeState(options: { jumpIn?: boolean } = {}): GameState {
  return {
    phase: 'playing',
    players: [
      {
        id: 'human',
        name: 'Human',
        hand: [{ id: 'human-card', type: 'number', color: 'blue', value: 2 }],
        score: 0,
        connected: true,
        autopilot: false,
        calledUno: false,
        unoCaught: false,
        eliminated: false,
        isBot: false,
      },
      {
        id: 'bot',
        name: 'Bot',
        hand: [
          { id: 'jump-card', type: 'number', color: 'red', value: 5 },
          { id: 'bot-card', type: 'number', color: 'green', value: 7 },
        ],
        score: 0,
        connected: true,
        autopilot: false,
        calledUno: false,
        unoCaught: false,
        eliminated: false,
        isBot: true,
        botConfig: { difficulty: 'hard', personality: 'strategic' },
      },
    ],
    currentPlayerIndex: 0,
    direction: 'clockwise',
    deckLeft: [],
    deckRight: [],
    deckLeftInitialCount: 0,
    deckRightInitialCount: 0,
    discardPile: [{ id: 'top-card', type: 'number', color: 'red', value: 5 }],
    currentColor: 'red',
    drawStack: 0,
    pendingDrawPlayerId: null,
    pendingPenaltyDraws: 0,
    pendingPenaltyNextPlayerIndex: null,
    pendingPenaltySourcePlayerId: null,
    pendingPenaltyQueue: [],
    pendingRevengeDraws: 0,
    lastAction: null,
    roundNumber: 1,
    winnerId: null,
    deckHash: 'test',
    settings: {
      turnTimeLimit: 30,
      targetScore: 500,
      allowSpectators: true,
      spectatorMode: 'hidden',
      houseRules: {
        ...DEFAULT_HOUSE_RULES,
        jumpIn: options.jumpIn ?? false,
      },
    },
  };
}

function makeSession(initialState: GameState): {
  session: GameSession;
  applyAction: ReturnType<typeof vi.fn>;
  recordAutomatedTransition: ReturnType<typeof vi.fn>;
  setState: (state: GameState) => void;
} {
  let state = initialState;
  const applyAction = vi.fn(() => ({ success: true }));
  const recordAutomatedTransition = vi.fn();
  const session = {
    getFullState: () => state,
    getAutomationCycleGuard: () => undefined,
    applyAction,
    recordAutomatedTransition,
  } as unknown as GameSession;
  return {
    session,
    applyAction,
    recordAutomatedTransition,
    setState: nextState => {
      state = nextState;
    },
  };
}

function makePersister(): {
  persister: GameStatePersister;
  markDirty: ReturnType<typeof vi.fn>;
} {
  const markDirty = vi.fn();
  return {
    persister: { markDirty } as unknown as GameStatePersister,
    markDirty,
  };
}

function createGate(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  for (const roomCode of TEST_ROOMS) clearBotTimers(roomCode);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('bot UNO watcher lifecycle', () => {
  it('invalidates an already-fired catch callback and preserves the replacement session timer', async () => {
    const roomCode = 'UNO_CLEAR';
    const old = makeSession(makeState());
    const replacement = makeSession(makeState());
    const sessions = new Map<string, GameSession>([[roomCode, old.session]]);
    const { persister, markDirty } = makePersister();
    const emitUpdate = vi.fn(async () => undefined);
    const blocker = createGate();
    const blockerEntered = createGate();
    const heldLock = withRoomLifecycleLock(roomCode, async () => {
      blockerEntered.resolve();
      await blocker.promise;
    });
    await blockerEntered.promise;

    checkBotUnoCatch(io, redis, roomCode, old.session, persister, emitUpdate, sessions);
    vi.advanceTimersByTime(500);
    await flushMicrotasks();

    clearBotTimers(roomCode);
    sessions.set(roomCode, replacement.session);
    checkBotUnoCatch(io, redis, roomCode, replacement.session, persister, emitUpdate, sessions);

    blocker.resolve();
    await heldLock;
    await flushMicrotasks();

    // The stale callback must not delete the new session's pending-pair owner,
    // otherwise this duplicate check would arm a second replacement timer.
    checkBotUnoCatch(io, redis, roomCode, replacement.session, persister, emitUpdate, sessions);
    await vi.advanceTimersByTimeAsync(500);

    expect(old.applyAction).not.toHaveBeenCalled();
    expect(replacement.applyAction).toHaveBeenCalledTimes(1);
    expect(replacement.applyAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CATCH_UNO',
        catcherId: 'bot',
        targetId: 'human',
      }),
    );
    expect(markDirty).toHaveBeenCalledTimes(1);
    expect(emitUpdate).toHaveBeenCalledTimes(1);
  });

  it('rejects a queued jump-in callback when the room now owns another session', async () => {
    const roomCode = 'UNO_SESSION';
    const old = makeSession(makeState({ jumpIn: true }));
    const replacement = makeSession(makeState({ jumpIn: true }));
    const sessions = new Map<string, GameSession>([[roomCode, old.session]]);
    const { persister, markDirty } = makePersister();
    const emitUpdate = vi.fn(async () => undefined);
    const onTurnChange = vi.fn();
    const blocker = createGate();
    const blockerEntered = createGate();
    const heldLock = withRoomLifecycleLock(roomCode, async () => {
      blockerEntered.resolve();
      await blocker.promise;
    });
    await blockerEntered.promise;

    expect(checkBotJumpIn(io, redis, roomCode, old.session, persister, emitUpdate, onTurnChange, sessions)).toBe(true);
    vi.advanceTimersByTime(320);
    await flushMicrotasks();

    sessions.set(roomCode, replacement.session);
    blocker.resolve();
    await heldLock;
    await flushMicrotasks();

    expect(old.applyAction).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
    expect(emitUpdate).not.toHaveBeenCalled();
    expect(onTurnChange).not.toHaveBeenCalled();
  });

  it('does not reuse a jump-in timer after the same session advances to a new turn state', async () => {
    const roomCode = 'UNO_TURN';
    const initialState = makeState({ jumpIn: true });
    const current = makeSession(initialState);
    const sessions = new Map<string, GameSession>([[roomCode, current.session]]);
    const { persister, markDirty } = makePersister();
    const emitUpdate = vi.fn(async () => undefined);
    const onTurnChange = vi.fn();

    expect(checkBotJumpIn(io, redis, roomCode, current.session, persister, emitUpdate, onTurnChange, sessions)).toBe(
      true,
    );

    current.setState({
      ...initialState,
      currentPlayerIndex: 1,
      lastAction: { type: 'PASS', playerId: 'human' },
    });
    await vi.advanceTimersByTimeAsync(320);

    expect(current.applyAction).not.toHaveBeenCalled();
    expect(markDirty).not.toHaveBeenCalled();
    expect(emitUpdate).not.toHaveBeenCalled();
    expect(onTurnChange).not.toHaveBeenCalled();
  });

  it('keeps catch validation, mutation, persistence, and emission in one lifecycle lock', async () => {
    const roomCode = 'UNO_LOCK';
    const current = makeSession(makeState());
    const sessions = new Map<string, GameSession>([[roomCode, current.session]]);
    const { persister, markDirty } = makePersister();
    const initialBlocker = createGate();
    const blockerEntered = createGate();
    const emitGate = createGate();
    const emitStarted = createGate();
    const order: string[] = [];
    current.applyAction.mockImplementation(() => {
      order.push('apply');
      return { success: true };
    });
    markDirty.mockImplementation(() => {
      order.push('persist');
    });
    const emitUpdate = vi.fn(async () => {
      order.push('emit:start');
      emitStarted.resolve();
      await emitGate.promise;
      order.push('emit:end');
    });

    const heldLock = withRoomLifecycleLock(roomCode, async () => {
      blockerEntered.resolve();
      await initialBlocker.promise;
    });
    await blockerEntered.promise;
    checkBotUnoCatch(io, redis, roomCode, current.session, persister, emitUpdate, sessions);
    vi.advanceTimersByTime(500);
    await flushMicrotasks();

    const observer = withRoomLifecycleLock(roomCode, () => {
      order.push('observer');
    });
    expect(order).toEqual([]);

    initialBlocker.resolve();
    await heldLock;
    await emitStarted.promise;
    expect(order).toEqual(['apply', 'persist', 'emit:start']);

    emitGate.resolve();
    await observer;
    expect(order).toEqual(['apply', 'persist', 'emit:start', 'emit:end', 'observer']);
  });
});

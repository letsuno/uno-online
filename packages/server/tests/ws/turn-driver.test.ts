import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameSession } from '../../src/plugins/core/game/session.js';
import { GameStatePersister } from '../../src/plugins/core/game/state-store.js';
import { TurnTimer } from '../../src/plugins/core/game/turn-timer.js';
import { MemoryKvStore } from '../../src/kv/memory.js';
import { clearAllRoomEventTimers, ensureTurnDriver, startTurnTimer } from '../../src/ws/room-events.js';
import { makeFakeIo } from '../helpers/fake-io.js';
import { makeGameState } from '../helpers/test-utils.js';

afterEach(() => {
  clearAllRoomEventTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('turn driver deadlines', () => {
  it('arms a restored human turn for only the remaining snapshot deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const roomCode = 'TURN55';
    const session = GameSession.fromState(makeGameState({ turnStartedAt: 85_000 }));
    const sessions = new Map([[roomCode, session]]);
    const timer = new TurnTimer();
    const kv = new MemoryKvStore();
    const persister = new GameStatePersister(kv);
    const fake = makeFakeIo();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    startTurnTimer(fake.io, kv, roomCode, session, timer, sessions, persister);
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 15_000);
    timer.stopAll();
  });

  it('does not restart an existing bot thinking driver during rejoin', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const roomCode = 'BOTD55';
    const state = makeGameState();
    state.players[0] = {
      ...state.players[0]!,
      isBot: true,
      botConfig: { difficulty: 'normal', personality: 'balanced' },
    };
    const session = GameSession.fromState(state);
    const sessions = new Map([[roomCode, session]]);
    const timer = new TurnTimer();
    const kv = new MemoryKvStore();
    const persister = new GameStatePersister(kv);
    const fake = makeFakeIo();

    startTurnTimer(fake.io, kv, roomCode, session, timer, sessions, persister);
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    ensureTurnDriver(fake.io, kv, roomCode, session, timer, sessions, persister);

    expect(clearTimeoutSpy).not.toHaveBeenCalled();
  });
});

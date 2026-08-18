import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_HOUSE_RULES, type PlayerView } from '@uno-online/shared';
import { useGameStore } from '../src/features/game/stores/game-store';

function createView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    viewerId: 'player-1',
    phase: 'playing',
    players: [],
    currentPlayerIndex: 0,
    direction: 'clockwise',
    discardPile: [],
    currentColor: null,
    drawStack: 0,
    pendingPenaltyDraws: 0,
    deckLeftCount: 20,
    deckRightCount: 20,
    discardPileCount: 1,
    roundNumber: 1,
    winnerId: null,
    settings: {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'full',
    },
    pendingDrawPlayerId: null,
    lastAction: null,
    deckHash: 'hash',
    gameStartedAt: 900_000,
    turnStartedAt: 1_000_000,
    ...overrides,
  };
}

describe('game store turn timing', () => {
  beforeEach(() => useGameStore.getState().clearGame());

  it('derives the deadline from the authoritative turn start timestamp', () => {
    useGameStore.getState().setGameState(createView());
    expect(useGameStore.getState().turnEndTime).toBe(1_030_000);
  });

  it('does not reset the deadline when the same turn is projected again', () => {
    const view = createView();
    useGameStore.getState().setGameState(view);
    const firstDeadline = useGameStore.getState().turnEndTime;

    useGameStore.getState().setGameState({ ...view, deckLeftCount: 19 });
    expect(useGameStore.getState().turnEndTime).toBe(firstDeadline);
  });

  it('applies fast mode and clears the deadline in terminal phases', () => {
    useGameStore.getState().setGameState(
      createView({
        settings: {
          ...createView().settings,
          houseRules: { ...DEFAULT_HOUSE_RULES, fastMode: true },
        },
      }),
    );
    expect(useGameStore.getState().turnEndTime).toBe(1_015_000);

    useGameStore.getState().setGameState(createView({ phase: 'round_end' }));
    expect(useGameStore.getState().turnEndTime).toBeNull();
  });
});

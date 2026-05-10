import { describe, expect, it } from 'vitest';
import { DEFAULT_HOUSE_RULES, type GameState } from '@uno-online/shared';
import { getAutopilotActionPlayerId } from '../../src/ws/autopilot-action-player';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'playing',
    players: [
      { id: 'p1', name: 'Player 1', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
      { id: 'p2', name: 'Player 2', hand: [], score: 0, connected: true, autopilot: true, calledUno: false },
    ],
    currentPlayerIndex: 0,
    direction: 'clockwise',
    deckLeft: [],
    deckRight: [],
    deckLeftInitialCount: 0,
    deckRightInitialCount: 0,
    discardPile: [{ id: 'top', type: 'number', color: 'red', value: 1 }],
    currentColor: 'red',
    drawStack: 0,
    pendingDrawPlayerId: null,
    pendingPenaltyDraws: 0,
    pendingPenaltyNextPlayerIndex: null,
    pendingPenaltySourcePlayerId: null,
    pendingPenaltyQueue: [],
    lastAction: null,
    roundNumber: 1,
    winnerId: null,
    deckHash: 'test',
    settings: {
      turnTimeLimit: 30,
      targetScore: 500,
      houseRules: DEFAULT_HOUSE_RULES,
      allowSpectators: true,
      spectatorMode: 'hidden',
    },
    ...overrides,
  };
}

describe('getAutopilotActionPlayerId', () => {
  it('uses the current player during normal play', () => {
    expect(getAutopilotActionPlayerId(makeState({ currentPlayerIndex: 0 }))).toBe('p1');
  });

  it('uses the pending draw player during +4 challenge resolution', () => {
    expect(getAutopilotActionPlayerId(makeState({
      phase: 'challenging',
      currentPlayerIndex: 0,
      pendingDrawPlayerId: 'p2',
    }))).toBe('p2');
  });

  it('does not choose an actor after the round has ended', () => {
    expect(getAutopilotActionPlayerId(makeState({ phase: 'round_end' }))).toBeNull();
  });
});

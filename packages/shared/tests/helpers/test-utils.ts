import type { Card, Color } from '../../src/types/card';
import type { GameAction, GameState } from '../../src/types/game';
import { DEFAULT_HOUSE_RULES } from '../../src/types/house-rules';

/**
 * Universal card factory for tests.
 */
export function makeCard(type: Card['type'], color: Color | null, extra?: { value?: number; id?: string }): Card {
  const id = extra?.id ?? `card_${Math.random().toString(36).slice(2, 8)}`;
  switch (type) {
    case 'number': return { id, type, color: color as Color, value: extra?.value ?? 0 };
    case 'skip': return { id, type, color: color as Color };
    case 'reverse': return { id, type, color: color as Color };
    case 'draw_two': return { id, type, color: color as Color };
    case 'wild': return { id, type, color: null };
    case 'wild_draw_four': return { id, type, color: null };
  }
}

/**
 * Game state factory with comprehensive defaults.
 * All fields from GameState are covered so any test can rely on sensible values.
 */
export function makeState(overrides: Partial<GameState> = {}): GameState {
  const defaults: GameState = {
    phase: 'playing',
    players: [
      { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
      { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
      { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
    ],
    currentPlayerIndex: 0,
    direction: 'clockwise',
    deckLeft: Array.from({ length: 20 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `deck_${i}` })),
    deckRight: [],
    deckLeftInitialCount: 20,
    deckRightInitialCount: 0,
    discardPile: [makeCard('number', 'red', { value: 5, id: 'discard_top' })],
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
    deckHash: '',
    settings: {
      turnTimeLimit: 30,
      targetScore: 500,
      allowSpectators: true,
      spectatorMode: 'hidden',
      houseRules: DEFAULT_HOUSE_RULES,
    },
  };
  return { ...defaults, ...overrides };
}

/**
 * Helper that draws all pending penalty cards for the current player.
 * Accepts an `applyFn` so callers can pass either `applyAction` or `applyActionWithHouseRules`.
 */
export function drawPendingPenalty(
  state: GameState,
  applyFn: (state: GameState, action: GameAction) => GameState,
): GameState {
  let current = state;
  while ((current.pendingPenaltyDraws ?? 0) > 0) {
    const playerId = current.players[current.currentPlayerIndex]!.id;
    current = applyFn(current, { type: 'DRAW_CARD', playerId, side: 'left' as const });
  }
  return current;
}

// ── Per-type convenience factories (used by validation.test.ts) ──

export function numberCard(color: Color, value: number, id = 'c1'): Card {
  return { id, type: 'number', color, value };
}

export function skipCard(color: Color, id = 'c1'): Card {
  return { id, type: 'skip', color };
}

export function reverseCard(color: Color, id = 'c1'): Card {
  return { id, type: 'reverse', color };
}

export function drawTwoCard(color: Color, id = 'c1'): Card {
  return { id, type: 'draw_two', color };
}

export function wildCard(id = 'c1'): Card {
  return { id, type: 'wild', color: null };
}

export function wildDrawFour(id = 'c1'): Card {
  return { id, type: 'wild_draw_four', color: null };
}

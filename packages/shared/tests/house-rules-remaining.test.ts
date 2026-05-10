import { describe, it, expect } from 'vitest';
import { applyActionWithHouseRules } from '../src/rules/house-rules-engine';
import type { GameState } from '../src/types/game';
import type { Card, Color } from '../src/types/card';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules';

function makeCard(type: Card['type'], color: Color | null, extra?: { value?: number; id?: string }): Card {
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

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'playing',
    players: [
      { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
      { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
      { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
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
    lastAction: null,
    roundNumber: 1,
    winnerId: null,
    settings: { turnTimeLimit: 30, targetScore: 500, houseRules: DEFAULT_HOUSE_RULES },
    ...overrides,
  };
}

function drawPendingPenalty(state: GameState): GameState {
  let current = state;
  while ((current.pendingPenaltyDraws ?? 0) > 0) {
    const playerId = current.players[current.currentPlayerIndex]!.id;
    current = applyActionWithHouseRules(current, { type: 'DRAW_CARD', playerId, side: 'left' as const });
  }
  return current;
}

// ──────────────────────────────────────────────────────────────────────────────
// stackDrawTwo
// ──────────────────────────────────────────────────────────────────────────────

describe('stackDrawTwo', () => {
  it('starts a draw stack when the first +2 is played', () => {
    const d2Play = makeCard('draw_two', 'red', { id: 'd2play' });
    const extra = makeCard('number', 'red', { value: 1, id: 'extra' });
    const state = makeState({
      drawStack: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [d2Play, extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('draw_two', 'blue', { id: 'p2d2' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, stackDrawTwo: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd2play' });

    expect(next.drawStack).toBe(2);
    expect(next.players[1]!.hand).toHaveLength(1);
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('d2play');
  });

  it('+2 stacks on +2: drawStack increases by 2 and turn advances', () => {
    const d2Top = makeCard('draw_two', 'red', { id: 'd2top' });
    const d2Play = makeCard('draw_two', 'red', { id: 'd2play' });
    const extra = makeCard('number', 'red', { value: 1, id: 'extra' });
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' }), d2Top],
      currentColor: 'red',
      drawStack: 2, // someone already played a +2
      players: [
        { id: 'p1', name: 'Alice', hand: [d2Play, extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, stackDrawTwo: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd2play' });

    // Stack increases from 2 to 4
    expect(next.drawStack).toBe(4);
    // d2play should now be on top of the discard pile
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('d2play');
    // p1's hand should no longer have d2play
    expect(next.players[0]!.hand.find(c => c.id === 'd2play')).toBeUndefined();
    // Turn advances to p2
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('without stackDrawTwo, playing +2 with an active drawStack falls through to standard engine', () => {
    const d2Top = makeCard('draw_two', 'red', { id: 'd2top' });
    const d2Play = makeCard('draw_two', 'red', { id: 'd2play' });
    const extra = makeCard('number', 'red', { value: 9, id: 'extra' });
    const deck = Array.from({ length: 5 }, (_, i) => makeCard('number', 'blue', { value: i, id: `d${i}` }));
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' }), d2Top],
      currentColor: 'red',
      drawStack: 2,
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [d2Play, extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd2play' });
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('d2play');
    expect(next.pendingPenaltyDraws).toBe(2);
    const paid = drawPendingPenalty(next);
    expect(paid.players[1]!.hand).toHaveLength(3);
    expect(paid.drawStack).toBe(2);
  });

  it('DRAW_CARD with active stack draws full stack amount', () => {
    const d2Top = makeCard('draw_two', 'red', { id: 'd2top' });
    const deck = Array.from({ length: 10 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `d${i}` }));
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' }), d2Top],
      currentColor: 'red',
      drawStack: 4,
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, stackDrawTwo: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });

    expect(next.pendingPenaltyDraws).toBe(3);
    // p1 draws the first stacked card immediately, then pays the rest one by one.
    const paid = drawPendingPenalty(next);
    expect(paid.players[0]!.hand).toHaveLength(4);
    // drawStack resets to 0
    expect(paid.drawStack).toBe(0);
    // Turn advances to p2
    expect(paid.currentPlayerIndex).toBe(1);
  });

  it('lets the third player draw 4 after two +2 cards are stacked', () => {
    const firstD2 = makeCard('draw_two', 'red', { id: 'first_d2' });
    const secondD2 = makeCard('draw_two', 'red', { id: 'second_d2' });
    const deck = Array.from({ length: 10 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `d${i}` }));
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' })],
      currentColor: 'red',
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [firstD2, makeCard('number', 'blue', { value: 1, id: 'p1c' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [secondD2, makeCard('number', 'blue', { value: 2, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 3, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, stackDrawTwo: true },
      },
    });

    const afterFirstD2 = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'first_d2' });
    expect(afterFirstD2.drawStack).toBe(2);
    expect(afterFirstD2.currentPlayerIndex).toBe(1);

    const afterSecondD2 = applyActionWithHouseRules(afterFirstD2, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'second_d2' });
    expect(afterSecondD2.drawStack).toBe(4);
    expect(afterSecondD2.currentPlayerIndex).toBe(2);

    const next = applyActionWithHouseRules(afterSecondD2, { type: 'DRAW_CARD', playerId: 'p3', side: 'left' as const });

    expect(next).not.toBe(afterSecondD2);
    expect(next.pendingPenaltyDraws).toBe(3);
    const paid = drawPendingPenalty(next);
    expect(paid.players[2]!.hand.map(c => c.id)).toEqual(['p3c', 'd0', 'd1', 'd2', 'd3']);
    expect(paid.drawStack).toBe(0);
    expect(paid.currentPlayerIndex).toBe(0);
  });

  it('ends the round after a last-card stack is paid', () => {
    const d2Top = makeCard('draw_two', 'red', { id: 'd2top' });
    const deck = Array.from({ length: 10 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `d${i}` }));
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' }), d2Top],
      currentColor: 'red',
      currentPlayerIndex: 0,
      drawStack: 2,
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      lastAction: { type: 'PLAY_CARD', playerId: 'p2', cardId: 'd2top' },
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'blue', { value: 1, id: 'p1c' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, stackDrawTwo: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });
    const paid = drawPendingPenalty(next);

    expect(paid.phase).toBe('round_end');
    expect(paid.winnerId).toBe('p2');
    expect(paid.drawStack).toBe(0);
    expect(paid.players[0]!.hand).toHaveLength(3);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// stackDrawFour
// ──────────────────────────────────────────────────────────────────────────────

describe('stackDrawFour', () => {
  it('starts a draw stack when the first +4 is played', () => {
    const wd4Play = makeCard('wild_draw_four', null, { id: 'wd4play' });
    const extra = makeCard('number', 'blue', { value: 1, id: 'extra' });
    const state = makeState({
      drawStack: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [wd4Play, extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('wild_draw_four', null, { id: 'p2wd4' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, stackDrawFour: true },
      },
    });

    const next = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'wd4play',
      chosenColor: 'blue',
    });

    expect(next.drawStack).toBe(4);
    expect(next.currentColor).toBe('blue');
    expect(next.players[1]!.hand).toHaveLength(1);
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.discardPile[next.discardPile.length - 1]).toMatchObject({
      id: 'wd4play',
      chosenColor: 'blue',
    });
  });

  it('+4 stacks on +4: drawStack increases by 4', () => {
    const wd4Top = makeCard('wild_draw_four', null, { id: 'wd4top' });
    const wd4Play = makeCard('wild_draw_four', null, { id: 'wd4play' });
    const extra = makeCard('number', 'blue', { value: 1, id: 'extra' });
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' }), wd4Top],
      currentColor: 'red',
      drawStack: 4,
      players: [
        { id: 'p1', name: 'Alice', hand: [wd4Play, extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, stackDrawFour: true },
      },
    });

    const next = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'wd4play',
      chosenColor: 'yellow',
    });

    expect(next.drawStack).toBe(8);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('wd4play');
    expect(next.discardPile[next.discardPile.length - 1]).toMatchObject({ chosenColor: 'yellow' });
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('allows normal play after a +4 stack penalty is paid one card at a time', () => {
    const wd4Top = makeCard('wild_draw_four', null, { id: 'wd4top' });
    const deck = Array.from({ length: 12 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `wd4deck_${i}` }));
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' }), wd4Top],
      currentColor: 'green',
      currentPlayerIndex: 0,
      drawStack: 4,
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      lastAction: { type: 'PLAY_CARD', playerId: 'p3', cardId: 'wd4top' },
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 3, id: 'p2green3' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 4, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, stackDrawFour: true },
      },
    });

    let next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });
    expect(next.pendingPenaltyDraws).toBe(3);
    expect(next.drawStack).toBe(0);

    next = applyActionWithHouseRules(next, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });
    expect(next.pendingPenaltyDraws).toBe(2);
    next = applyActionWithHouseRules(next, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });
    expect(next.pendingPenaltyDraws).toBe(1);
    next = applyActionWithHouseRules(next, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });
    expect(next.pendingPenaltyDraws).toBe(0);
    expect(next.currentPlayerIndex).toBe(1);

    next = applyActionWithHouseRules(next, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'p2green3' });
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('p2green3');
    expect(next.currentPlayerIndex).toBe(2);
  });

  it('blocks passing while a +4 stack penalty is waiting to be drawn', () => {
    const wd4Top = makeCard('wild_draw_four', null, { id: 'wd4top' });
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' }), wd4Top],
      currentColor: 'green',
      currentPlayerIndex: 0,
      drawStack: 4,
      lastAction: { type: 'DRAW_CARD', playerId: 'p1' },
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'green', { value: 3, id: 'p1green3' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 4, id: 'p2green4' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 5, id: 'p3green5' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, stackDrawFour: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'PASS', playerId: 'p1' });

    expect(next).toStrictEqual(state);
  });

  it('lets the third player draw 8 after two +4 cards are stacked', () => {
    const firstWd4 = makeCard('wild_draw_four', null, { id: 'first_wd4' });
    const secondWd4 = makeCard('wild_draw_four', null, { id: 'second_wd4' });
    const deck = Array.from({ length: 12 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `wd4d${i}` }));
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' })],
      currentColor: 'red',
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [firstWd4, makeCard('number', 'blue', { value: 1, id: 'p1c' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [secondWd4, makeCard('number', 'blue', { value: 2, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 3, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, stackDrawFour: true },
      },
    });

    const afterFirstWd4 = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'first_wd4',
      chosenColor: 'red',
    });
    expect(afterFirstWd4.drawStack).toBe(4);
    expect(afterFirstWd4.currentPlayerIndex).toBe(1);

    const afterSecondWd4 = applyActionWithHouseRules(afterFirstWd4, {
      type: 'PLAY_CARD',
      playerId: 'p2',
      cardId: 'second_wd4',
      chosenColor: 'red',
    });
    expect(afterSecondWd4.drawStack).toBe(8);
    expect(afterSecondWd4.currentPlayerIndex).toBe(2);

    const next = applyActionWithHouseRules(afterSecondWd4, { type: 'DRAW_CARD', playerId: 'p3', side: 'left' as const });

    expect(next).not.toBe(afterSecondWd4);
    expect(next.pendingPenaltyDraws).toBe(7);
    const paid = drawPendingPenalty(next);
    expect(paid.players[2]!.hand.map(c => c.id)).toEqual([
      'p3c',
      'wd4d0',
      'wd4d1',
      'wd4d2',
      'wd4d3',
      'wd4d4',
      'wd4d5',
      'wd4d6',
      'wd4d7',
    ]);
    expect(paid.drawStack).toBe(0);
    expect(paid.currentPlayerIndex).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// crossStack
// ──────────────────────────────────────────────────────────────────────────────

describe('crossStack', () => {
  it('+2 can stack on +4 when crossStack is enabled', () => {
    const wd4Top = makeCard('wild_draw_four', null, { id: 'wd4top' });
    const d2Play = makeCard('draw_two', 'blue', { id: 'd2play' });
    const extra = makeCard('number', 'blue', { value: 1, id: 'extra' });
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' }), wd4Top],
      currentColor: 'blue',
      drawStack: 4,
      players: [
        { id: 'p1', name: 'Alice', hand: [d2Play, extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, crossStack: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd2play' });

    // cross: +4 stack + +2 = 6
    expect(next.drawStack).toBe(6);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('d2play');
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('+4 can stack on +2 when crossStack is enabled', () => {
    const d2Top = makeCard('draw_two', 'red', { id: 'd2top' });
    const wd4Play = makeCard('wild_draw_four', null, { id: 'wd4play' });
    const extra = makeCard('number', 'blue', { value: 1, id: 'extra' });
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' }), d2Top],
      currentColor: 'red',
      drawStack: 2,
      players: [
        { id: 'p1', name: 'Alice', hand: [wd4Play, extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, crossStack: true },
      },
    });

    const next = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'wd4play',
      chosenColor: 'yellow',
    });

    // cross: +2 stack + +4 = 6
    expect(next.drawStack).toBe(6);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('wd4play');
    expect(next.discardPile[next.discardPile.length - 1]).toMatchObject({ chosenColor: 'yellow' });
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('rejects stacked +4 without a chosen color', () => {
    const d2Top = makeCard('draw_two', 'red', { id: 'd2top_no_color' });
    const wd4Play = makeCard('wild_draw_four', null, { id: 'wd4play_no_color' });
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base_no_color' }), d2Top],
      currentColor: 'red',
      drawStack: 2,
      players: [
        { id: 'p1', name: 'Alice', hand: [wd4Play, makeCard('number', 'blue', { value: 1, id: 'extra_no_color' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c_no_color' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c_no_color' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, crossStack: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4play_no_color' });

    expect(next).toStrictEqual(state);
  });

  it('lets the third player draw 6 after +2 then +4 are stacked', () => {
    const firstD2 = makeCard('draw_two', 'red', { id: 'first_d2_cross' });
    const secondWd4 = makeCard('wild_draw_four', null, { id: 'second_wd4_cross' });
    const deck = Array.from({ length: 10 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `crossd${i}` }));
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' })],
      currentColor: 'red',
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [firstD2, makeCard('number', 'blue', { value: 1, id: 'p1c' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [secondWd4, makeCard('number', 'blue', { value: 2, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 3, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, crossStack: true },
      },
    });

    const afterFirstD2 = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'first_d2_cross' });
    expect(afterFirstD2.drawStack).toBe(2);
    expect(afterFirstD2.currentPlayerIndex).toBe(1);

    const afterSecondWd4 = applyActionWithHouseRules(afterFirstD2, {
      type: 'PLAY_CARD',
      playerId: 'p2',
      cardId: 'second_wd4_cross',
      chosenColor: 'red',
    });
    expect(afterSecondWd4.drawStack).toBe(6);
    expect(afterSecondWd4.currentPlayerIndex).toBe(2);

    const next = applyActionWithHouseRules(afterSecondWd4, { type: 'DRAW_CARD', playerId: 'p3', side: 'left' as const });

    expect(next).not.toBe(afterSecondWd4);
    expect(next.pendingPenaltyDraws).toBe(5);
    const paid = drawPendingPenalty(next);
    expect(paid.players[2]!.hand.map(c => c.id)).toEqual([
      'p3c',
      'crossd0',
      'crossd1',
      'crossd2',
      'crossd3',
      'crossd4',
      'crossd5',
    ]);
    expect(paid.drawStack).toBe(0);
    expect(paid.currentPlayerIndex).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Penalty draws with forced draw/play rules
// ──────────────────────────────────────────────────────────────────────────────

describe('penalty draws with forced draw/play rules', () => {
  const forcedDrawRules = {
    ...DEFAULT_HOUSE_RULES,
    drawUntilPlayable: true,
    forcedPlayAfterDraw: true,
    forcedPlay: true,
  };

  it('does not allow playing a playable card drawn while paying a +2 penalty', () => {
    const drawnPlayable = makeCard('number', 'red', { value: 7, id: 'drawn_playable' });
    const state = makeState({
      currentPlayerIndex: 1,
      currentColor: 'red',
      discardPile: [makeCard('draw_two', 'red', { id: 'd2top' })],
      pendingPenaltyDraws: 2,
      pendingPenaltyNextPlayerIndex: 2,
      pendingPenaltySourcePlayerId: 'p1',
      deckLeft: [drawnPlayable, makeCard('number', 'blue', { value: 1, id: 'second_penalty' })],
      deckRight: [],
      deckLeftInitialCount: 2,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'green', { value: 1, id: 'p1extra' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 9, id: 'p2old' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: forcedDrawRules },
    });

    const afterFirstDraw = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' as const });
    expect(afterFirstDraw.players[1]!.hand.map(c => c.id)).toEqual(['p2old', 'drawn_playable']);
    expect(afterFirstDraw.pendingPenaltyDraws).toBe(1);
    expect(afterFirstDraw.currentPlayerIndex).toBe(1);
    expect(afterFirstDraw.discardPile[afterFirstDraw.discardPile.length - 1]!.id).toBe('d2top');

    const playAttempt = applyActionWithHouseRules(afterFirstDraw, {
      type: 'PLAY_CARD',
      playerId: 'p2',
      cardId: 'drawn_playable',
    });
    expect(playAttempt).toBe(afterFirstDraw);

    const passAttempt = applyActionWithHouseRules(afterFirstDraw, { type: 'PASS', playerId: 'p2' });
    expect(passAttempt).toBe(afterFirstDraw);

    const afterSecondDraw = applyActionWithHouseRules(afterFirstDraw, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' as const });
    expect(afterSecondDraw.pendingPenaltyDraws).toBe(0);
    expect(afterSecondDraw.currentPlayerIndex).toBe(2);
    expect(afterSecondDraw.players[1]!.hand.map(c => c.id)).toEqual(['p2old', 'drawn_playable', 'second_penalty']);
    expect(afterSecondDraw.discardPile[afterSecondDraw.discardPile.length - 1]!.id).toBe('d2top');
  });

  it('ends the round after paying a +4 penalty without forcing the drawn playable card', () => {
    const drawnPlayable = makeCard('number', 'green', { value: 4, id: 'drawn_green' });
    const state = makeState({
      currentPlayerIndex: 1,
      currentColor: 'green',
      discardPile: [makeCard('wild_draw_four', null, { id: 'wd4top' })],
      pendingPenaltyDraws: 1,
      pendingPenaltyNextPlayerIndex: 2,
      pendingPenaltySourcePlayerId: 'p1',
      deckLeft: [drawnPlayable],
      deckRight: [],
      deckLeftInitialCount: 1,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 9, id: 'p2old' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      lastAction: { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4top' },
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: forcedDrawRules },
    });

    const afterPenalty = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' as const });

    expect(afterPenalty.phase).toBe('round_end');
    expect(afterPenalty.winnerId).toBe('p1');
    expect(afterPenalty.players[1]!.hand.map(c => c.id)).toEqual(['p2old', 'drawn_green']);
    expect(afterPenalty.discardPile[afterPenalty.discardPile.length - 1]!.id).toBe('wd4top');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// zeroRotateHands
// ──────────────────────────────────────────────────────────────────────────────

describe('zeroRotateHands', () => {
  it('hands rotate clockwise after playing a 0', () => {
    const zero = makeCard('number', 'red', { value: 0, id: 'zero' });
    const p1extra = makeCard('number', 'blue', { value: 1, id: 'p1e' });
    const p2card = makeCard('number', 'green', { value: 2, id: 'p2c' });
    const p3card = makeCard('number', 'yellow', { value: 3, id: 'p3c' });

    const state = makeState({
      direction: 'clockwise',
      players: [
        { id: 'p1', name: 'Alice', hand: [zero, p1extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [p2card], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [p3card], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, zeroRotateHands: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'zero' });

    // Clockwise rotation: each player receives hand from the player before them
    // p1 (idx 0) gets hands[idx-1] = hands[2] = p3's hand = [p3card]
    // p2 (idx 1) gets hands[idx-1] = hands[0] = p1's remaining hand = [p1extra]
    // p3 (idx 2) gets hands[idx-1] = hands[1] = p2's hand = [p2card]
    expect(next.players[0]!.hand.map(c => c.id)).toEqual([p3card.id]);
    expect(next.players[1]!.hand.map(c => c.id)).toEqual([p1extra.id]);
    expect(next.players[2]!.hand.map(c => c.id)).toEqual([p2card.id]);
  });

  it('hands rotate counter-clockwise after playing a 0 in that direction', () => {
    const zero = makeCard('number', 'red', { value: 0, id: 'zero' });
    const p1extra = makeCard('number', 'blue', { value: 1, id: 'p1e' });
    const p2card = makeCard('number', 'green', { value: 2, id: 'p2c' });
    const p3card = makeCard('number', 'yellow', { value: 3, id: 'p3c' });

    const state = makeState({
      direction: 'counter_clockwise',
      players: [
        { id: 'p1', name: 'Alice', hand: [zero, p1extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [p2card], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [p3card], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, zeroRotateHands: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'zero' });

    // Counter-clockwise: each player receives hand from player after them
    // p1 (idx 0) gets hands[(0+1)%3] = hands[1] = p2's hand = [p2card]
    // p2 (idx 1) gets hands[(1+1)%3] = hands[2] = p3's hand = [p3card]
    // p3 (idx 2) gets hands[(2+1)%3] = hands[0] = p1's remaining hand = [p1extra]
    expect(next.players[0]!.hand.map(c => c.id)).toEqual([p2card.id]);
    expect(next.players[1]!.hand.map(c => c.id)).toEqual([p3card.id]);
    expect(next.players[2]!.hand.map(c => c.id)).toEqual([p1extra.id]);
  });

  it('does NOT rotate hands when zeroRotateHands is off', () => {
    const zero = makeCard('number', 'red', { value: 0, id: 'zero' });
    const p1extra = makeCard('number', 'blue', { value: 1, id: 'p1e' });
    const p2card = makeCard('number', 'green', { value: 2, id: 'p2c' });

    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [zero, p1extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [p2card], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'zero' });

    // No rotation — p1 keeps p1extra, p2 keeps p2card
    expect(next.players[0]!.hand.map(c => c.id)).toEqual([p1extra.id]);
    expect(next.players[1]!.hand.map(c => c.id)).toEqual([p2card.id]);
  });

  it('does NOT rotate hands when a non-zero number card is played', () => {
    const five = makeCard('number', 'red', { value: 5, id: 'five' });
    const p1extra = makeCard('number', 'blue', { value: 1, id: 'p1e' });
    const p2card = makeCard('number', 'green', { value: 2, id: 'p2c' });

    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [five, p1extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [p2card], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, zeroRotateHands: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'five' });

    // No rotation — p1 keeps p1extra, p2 keeps p2card
    expect(next.players[0]!.hand.map(c => c.id)).toEqual([p1extra.id]);
    expect(next.players[1]!.hand.map(c => c.id)).toEqual([p2card.id]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// forcedPlay
// ──────────────────────────────────────────────────────────────────────────────

describe('forcedPlay', () => {
  it('rejects DRAW_CARD when player has a playable card', () => {
    const playable = makeCard('number', 'red', { value: 3, id: 'playable' });
    const unplayable = makeCard('number', 'blue', { value: 7, id: 'unplayable' });
    const deck = [makeCard('number', 'green', { value: 1, id: 'd1' })];

    const state = makeState({
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'top' })],
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [playable, unplayable], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, forcedPlay: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });

    // State should be unchanged — drawing rejected
    expect(next.players[0]!.hand).toHaveLength(2);
    expect(next).toStrictEqual(state);
  });

  it('allows DRAW_CARD when player has no playable card', () => {
    const unplayable = makeCard('number', 'blue', { value: 7, id: 'unplayable' });
    const deck = [makeCard('number', 'green', { value: 1, id: 'd1' })];

    const state = makeState({
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'top' })],
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [unplayable], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, forcedPlay: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });

    // Drawing should succeed — p1 now has 2 cards
    expect(next.players[0]!.hand).toHaveLength(2);
  });

  it('allows DRAW_CARD when forcedPlay is off, even with playable card', () => {
    const playable = makeCard('number', 'red', { value: 3, id: 'playable' });
    const deck = [makeCard('number', 'green', { value: 1, id: 'd1' })];

    const state = makeState({
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'top' })],
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [playable], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });

    // Without forcedPlay rule, drawing is allowed
    expect(next.players[0]!.hand).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// misplayPenalty
// ──────────────────────────────────────────────────────────────────────────────

describe('misplayPenalty', () => {
  it('draws 1 penalty card on invalid PLAY_CARD attempt', () => {
    // Try to play a blue card when current color is red and top card is red
    const invalidCard = makeCard('number', 'blue', { value: 7, id: 'invalid' });
    const validCard = makeCard('number', 'red', { value: 1, id: 'valid' });
    const deck = Array.from({ length: 5 }, (_, i) => makeCard('number', 'green', { value: i, id: `d${i}` }));

    const state = makeState({
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'top' })],
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [invalidCard, validCard], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, misplayPenalty: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'invalid' });

    expect(next.pendingPenaltyDraws).toBe(1);
    const paid = drawPendingPenalty(next);
    // p1 draws 1 penalty card (had 2, now has 3)
    expect(paid.players[0]!.hand).toHaveLength(3);
    // invalidCard still in hand (wasn't played)
    expect(paid.players[0]!.hand.find(c => c.id === 'invalid')).toBeDefined();
    // discard pile unchanged
    expect(paid.discardPile[paid.discardPile.length - 1]!.id).toBe('top');
  });

  it('does NOT penalize for invalid play when misplayPenalty is off', () => {
    const invalidCard = makeCard('number', 'blue', { value: 7, id: 'invalid' });
    const deck = [makeCard('number', 'green', { value: 1, id: 'd1' })];

    const state = makeState({
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'top' })],
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [invalidCard], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'invalid' });

    // State unchanged — no penalty, no play
    expect(next.players[0]!.hand).toHaveLength(1);
    expect(next).toStrictEqual(state);
  });

  it('does NOT trigger penalty on valid PLAY_CARD', () => {
    const validCard = makeCard('number', 'red', { value: 3, id: 'valid' });
    const deck = [makeCard('number', 'green', { value: 1, id: 'd1' })];

    const state = makeState({
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'top' })],
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [validCard, makeCard('number', 'blue', { value: 1, id: 'extra' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, misplayPenalty: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'valid' });

    // Card was played — p1 has 1 card (the extra), not penalized
    expect(next.players[0]!.hand).toHaveLength(1);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('valid');
  });

  it('does NOT penalize an out-of-turn invalid play attempt', () => {
    const invalidCard = makeCard('number', 'blue', { value: 7, id: 'invalid' });
    const deck = [makeCard('number', 'green', { value: 1, id: 'd1' })];
    const state = makeState({
      currentPlayerIndex: 0,
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'top' })],
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'red', { value: 1, id: 'p1c' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [invalidCard], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, misplayPenalty: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'invalid' });

    expect(next).toStrictEqual(state);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// handLimit
// ──────────────────────────────────────────────────────────────────────────────

describe('handLimit', () => {
  it('rejects DRAW_CARD when hand size is at the limit', () => {
    const handCards = Array.from({ length: 10 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 10, id: `hc${i}` })
    );
    const deck = [makeCard('number', 'green', { value: 1, id: 'd1' })];

    const state = makeState({
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: handCards, score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, handLimit: 10 },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });

    // Drawing should be rejected — hand stays at 10
    expect(next.players[0]!.hand).toHaveLength(10);
    expect(next).toStrictEqual(state);
  });

  it('rejects DRAW_CARD when hand size exceeds the limit', () => {
    const handCards = Array.from({ length: 12 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 10, id: `hc${i}` })
    );
    const deck = [makeCard('number', 'green', { value: 1, id: 'd1' })];

    const state = makeState({
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: handCards, score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, handLimit: 10 },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });

    // Drawing should be rejected — hand stays at 12
    expect(next.players[0]!.hand).toHaveLength(12);
    expect(next).toStrictEqual(state);
  });

  it('allows DRAW_CARD when hand size is below the limit', () => {
    const handCards = Array.from({ length: 5 }, (_, i) =>
      makeCard('number', 'blue', { value: i, id: `hc${i}` })
    );
    const deck = [makeCard('number', 'green', { value: 1, id: 'd1' })];

    const state = makeState({
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: handCards, score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, handLimit: 10 },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });

    // Drawing should succeed — p1 now has 6 cards
    expect(next.players[0]!.hand).toHaveLength(6);
  });

  it('allows DRAW_CARD freely when handLimit is null', () => {
    const handCards = Array.from({ length: 50 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 10, id: `hc${i}` })
    );
    const deck = [makeCard('number', 'green', { value: 1, id: 'd1' })];

    const state = makeState({
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: handCards, score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      // handLimit: null is the default
    });

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });

    // No limit — drawing succeeds
    expect(next.players[0]!.hand).toHaveLength(51);
  });
});

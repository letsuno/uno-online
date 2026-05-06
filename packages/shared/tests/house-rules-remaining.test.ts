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
    deck: Array.from({ length: 20 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `deck_${i}` })),
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
    const deck = Array.from({ length: 5 }, (_, i) => makeCard('number', 'blue', { value: i, id: `d${i}` }));
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' }), d2Top],
      currentColor: 'red',
      drawStack: 2,
      deck,
      players: [
        { id: 'p1', name: 'Alice', hand: [d2Play], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
    });

    // Without stackDrawTwo the stacking intercept is skipped — standard engine handles it
    // Standard engine plays the draw_two: p2 draws 2 from deck, turn advances past p2
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd2play' });
    // Card was played
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('d2play');
    // p2 drew 2 from deck (standard draw_two effect)
    expect(next.players[1]!.hand).toHaveLength(3); // 1 existing + 2 drawn
    // drawStack field unchanged (standard engine doesn't use it)
    expect(next.drawStack).toBe(2);
  });

  it('DRAW_CARD with active stack draws full stack amount', () => {
    const d2Top = makeCard('draw_two', 'red', { id: 'd2top' });
    const deck = Array.from({ length: 10 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `d${i}` }));
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' }), d2Top],
      currentColor: 'red',
      drawStack: 4,
      deck,
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

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1' });

    // p1 draws all 4 stacked cards
    expect(next.players[0]!.hand).toHaveLength(4);
    // drawStack resets to 0
    expect(next.drawStack).toBe(0);
    // Turn advances to p2
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('ends the round after a last-card stack is paid', () => {
    const d2Top = makeCard('draw_two', 'red', { id: 'd2top' });
    const deck = Array.from({ length: 10 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `d${i}` }));
    const state = makeState({
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' }), d2Top],
      currentColor: 'red',
      currentPlayerIndex: 0,
      drawStack: 2,
      deck,
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

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1' });

    expect(next.phase).toBe('round_end');
    expect(next.winnerId).toBe('p2');
    expect(next.drawStack).toBe(0);
    expect(next.players[0]!.hand).toHaveLength(3);
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

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4play' });

    expect(next.drawStack).toBe(8);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('wd4play');
    expect(next.currentPlayerIndex).toBe(1);
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

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4play' });

    // cross: +2 stack + +4 = 6
    expect(next.drawStack).toBe(6);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('wd4play');
    expect(next.currentPlayerIndex).toBe(1);
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
      deck,
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

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1' });

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
      deck,
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

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1' });

    // Drawing should succeed — p1 now has 2 cards
    expect(next.players[0]!.hand).toHaveLength(2);
  });

  it('allows DRAW_CARD when forcedPlay is off, even with playable card', () => {
    const playable = makeCard('number', 'red', { value: 3, id: 'playable' });
    const deck = [makeCard('number', 'green', { value: 1, id: 'd1' })];

    const state = makeState({
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'top' })],
      deck,
      players: [
        { id: 'p1', name: 'Alice', hand: [playable], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1' });

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
      deck,
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

    // p1 draws 1 penalty card (had 2, now has 3)
    expect(next.players[0]!.hand).toHaveLength(3);
    // invalidCard still in hand (wasn't played)
    expect(next.players[0]!.hand.find(c => c.id === 'invalid')).toBeDefined();
    // discard pile unchanged
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('top');
  });

  it('does NOT penalize for invalid play when misplayPenalty is off', () => {
    const invalidCard = makeCard('number', 'blue', { value: 7, id: 'invalid' });
    const deck = [makeCard('number', 'green', { value: 1, id: 'd1' })];

    const state = makeState({
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'top' })],
      deck,
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
      deck,
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
      deck,
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
      deck,
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

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1' });

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
      deck,
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

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1' });

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
      deck,
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

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1' });

    // Drawing should succeed — p1 now has 6 cards
    expect(next.players[0]!.hand).toHaveLength(6);
  });

  it('allows DRAW_CARD freely when handLimit is null', () => {
    const handCards = Array.from({ length: 50 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 10, id: `hc${i}` })
    );
    const deck = [makeCard('number', 'green', { value: 1, id: 'd1' })];

    const state = makeState({
      deck,
      players: [
        { id: 'p1', name: 'Alice', hand: handCards, score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      // handLimit: null is the default
    });

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1' });

    // No limit — drawing succeeds
    expect(next.players[0]!.hand).toHaveLength(51);
  });
});

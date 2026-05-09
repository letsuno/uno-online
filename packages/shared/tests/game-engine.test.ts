import { describe, it, expect } from 'vitest';
import { applyAction } from '../src/rules/game-engine';
import type { GameState, Player } from '../src/types/game';
import type { Card, Color } from '../src/types/card';

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
  const defaults: GameState = {
    phase: 'playing',
    players: [
      { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
      { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
      { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
    ],
    currentPlayerIndex: 0,
    direction: 'clockwise',
    deck: [],
    discardPile: [makeCard('number', 'red', { value: 5, id: 'discard_top' })],
    currentColor: 'red',
    drawStack: 0,
    pendingDrawPlayerId: null,
    lastAction: null,
    roundNumber: 1,
    winnerId: null,
    settings: { turnTimeLimit: 30, targetScore: 500 },
  };
  return { ...defaults, ...overrides };
}

function drawPendingPenalty(state: GameState): GameState {
  let current = state;
  while ((current.pendingPenaltyDraws ?? 0) > 0) {
    const playerId = current.players[current.currentPlayerIndex]!.id;
    current = applyAction(current, { type: 'DRAW_CARD', playerId });
  }
  return current;
}

// ──────────────────────────────────────────────────────────────────────────────
// PLAY_CARD
// ──────────────────────────────────────────────────────────────────────────────

describe('PLAY_CARD - matching number card', () => {
  it('plays red card on red top, advances turn to p2', () => {
    const card = makeCard('number', 'red', { value: 7, id: 'c1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deck: [makeCard('number', 'blue', { value: 1, id: 'd1' })],
    });
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.players[0]!.hand).toHaveLength(0);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('c1');
    expect(next.currentColor).toBe('red');
  });
});

describe('PLAY_CARD - rejects non-matching', () => {
  it('blue 7 on red 3 returns state unchanged', () => {
    const card = makeCard('number', 'blue', { value: 7, id: 'c1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      discardPile: [makeCard('number', 'red', { value: 3, id: 'discard_top' })],
      currentColor: 'red',
    });
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next).toStrictEqual(state);
  });
});

describe('PLAY_CARD - rejects wrong player', () => {
  it('p2 tries to play on p1 turn, state unchanged', () => {
    const card = makeCard('number', 'red', { value: 3, id: 'c2' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'c2' });
    expect(next).toStrictEqual(state);
  });
});

describe('PLAY_CARD - skip', () => {
  it('skips next player: p1 plays, p2 skipped, p3 becomes current', () => {
    const card = makeCard('skip', 'red', { id: 'c1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'blue', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
    });
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next.currentPlayerIndex).toBe(2); // p3 at index 2
  });
});

describe('PLAY_CARD - reverse', () => {
  it('reverses direction in 3-player: p1 plays reverse, direction flips and p3 is next', () => {
    const card = makeCard('reverse', 'red', { id: 'c1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'blue', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      direction: 'clockwise',
    });
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next.direction).toBe('counter_clockwise');
    // counter-clockwise from index 0 in a 3-player game goes to index 2
    expect(next.currentPlayerIndex).toBe(2);
  });
});

describe('PLAY_CARD - reverse in 2-player', () => {
  it('acts as skip: p1 plays reverse and keeps the turn', () => {
    const card = makeCard('reverse', 'red', { id: 'c1' });
    const state: GameState = {
      phase: 'playing',
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
      ],
      currentPlayerIndex: 0,
      direction: 'clockwise',
      deck: [],
      discardPile: [makeCard('number', 'red', { value: 5, id: 'discard_top' })],
      currentColor: 'red',
      drawStack: 0,
      pendingDrawPlayerId: null,
      lastAction: null,
      roundNumber: 1,
      winnerId: null,
      settings: { turnTimeLimit: 30, targetScore: 500 },
    };
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    // reverse in 2-player acts as skip, so p1 plays again
    expect(next.currentPlayerIndex).toBe(0);
  });
});

describe('PLAY_CARD - draw_two', () => {
  it('next player draws 2 cards, turn skips them', () => {
    const card = makeCard('draw_two', 'red', { id: 'c1' });
    const deckCards = [
      makeCard('number', 'blue', { value: 1, id: 'd1' }),
      makeCard('number', 'blue', { value: 2, id: 'd2' }),
      makeCard('number', 'blue', { value: 3, id: 'd3' }),
    ];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deck: deckCards,
    });
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next.players[1]!.hand).toHaveLength(0);
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.pendingPenaltyDraws).toBe(2);
    const afterPenalty = drawPendingPenalty(next);
    expect(afterPenalty.players[1]!.hand).toHaveLength(2);
    expect(afterPenalty.currentPlayerIndex).toBe(2);
  });
});

describe('PLAY_CARD - wild', () => {
  it('transitions to choosing_color phase', () => {
    const card = makeCard('wild', null, { id: 'c1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next.phase).toBe('choosing_color');
    expect(next.currentPlayerIndex).toBe(0); // still p1's turn until color is chosen
  });
});

describe('PLAY_CARD - wild_draw_four', () => {
  it('transitions to choosing_color with pendingDrawPlayerId set', () => {
    const card = makeCard('wild_draw_four', null, { id: 'c1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next.phase).toBe('choosing_color');
    expect(next.pendingDrawPlayerId).toBe('p2');
  });
});

describe('PLAY_CARD - last card triggers round end', () => {
  it('playing the last card transitions to round_end', () => {
    const card = makeCard('number', 'red', { value: 7, id: 'c1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      deck: [makeCard('number', 'blue', { value: 3, id: 'd1' })],
    });
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next.phase).toBe('round_end');
    expect(next.winnerId).toBe('p1');
    expect(next.players.find(p => p.id === 'p1')!.roundWins).toBe(1);
    expect(next.players.find(p => p.id === 'p2')!.roundWins).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DRAW_CARD
// ──────────────────────────────────────────────────────────────────────────────

describe('DRAW_CARD', () => {
  it('draws 1 card from deck into hand', () => {
    const drawnCard = makeCard('number', 'blue', { value: 3, id: 'd1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deck: [drawnCard],
    });
    const next = applyAction(state, { type: 'DRAW_CARD', playerId: 'p1' });
    expect(next.players[0]!.hand).toHaveLength(1);
    expect(next.players[0]!.hand[0]!.id).toBe('d1');
    expect(next.deck).toHaveLength(0);
  });

  it('sets lastAction to the draw action', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deck: [makeCard('number', 'blue', { value: 3, id: 'd1' })],
    });
    const action = { type: 'DRAW_CARD' as const, playerId: 'p1' };
    const next = applyAction(state, action);
    expect(next.lastAction).toStrictEqual(action);
  });

  it('draws from the top/front of the deck', () => {
    const firstCard = makeCard('number', 'blue', { value: 3, id: 'd1' });
    const secondCard = makeCard('number', 'green', { value: 4, id: 'd2' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deck: [firstCard, secondCard],
    });

    const next = applyAction(state, { type: 'DRAW_CARD', playerId: 'p1' });

    expect(next.players[0]!.hand[0]!.id).toBe('d1');
    expect(next.deck.map(c => c.id)).toEqual(['d2']);
  });
});

describe('DRAW_CARD - wrong player', () => {
  it('rejected when not current player', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deck: [makeCard('number', 'blue', { value: 3, id: 'd1' })],
    });
    const next = applyAction(state, { type: 'DRAW_CARD', playerId: 'p2' });
    expect(next).toStrictEqual(state);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PASS
// ──────────────────────────────────────────────────────────────────────────────

describe('PASS', () => {
  it('advances to next player after drawing', () => {
    const drawnCard = makeCard('number', 'blue', { value: 3, id: 'd1' });
    const drawAction = { type: 'DRAW_CARD' as const, playerId: 'p1' };
    const stateAfterDraw = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [drawnCard], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deck: [],
      lastAction: drawAction,
    });
    const next = applyAction(stateAfterDraw, { type: 'PASS', playerId: 'p1' });
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('rejected if player has not drawn', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      lastAction: null,
    });
    const next = applyAction(state, { type: 'PASS', playerId: 'p1' });
    expect(next).toStrictEqual(state);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CHOOSE_COLOR
// ──────────────────────────────────────────────────────────────────────────────

describe('CHOOSE_COLOR', () => {
  it('sets color and returns to playing phase for plain wild', () => {
    const state = makeState({
      phase: 'choosing_color',
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      currentColor: 'red',
      pendingDrawPlayerId: null,
    });
    const next = applyAction(state, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'blue' });
    expect(next.phase).toBe('playing');
    expect(next.currentColor).toBe('blue');
    expect(next.currentPlayerIndex).toBe(1); // advances to next player
  });

  it('moves to challenging phase for wild_draw_four', () => {
    const state = makeState({
      phase: 'choosing_color',
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      currentColor: 'red',
      pendingDrawPlayerId: 'p2',
    });
    const next = applyAction(state, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'green' });
    expect(next.phase).toBe('challenging');
    expect(next.currentColor).toBe('green');
  });

  it('ends the round after the last plain wild color is chosen', () => {
    const wild = makeCard('wild', null, { id: 'wild_last' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [wild], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 4, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 6, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
    });

    const afterPlay = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wild_last' });
    const afterColor = applyAction(afterPlay, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'blue' });

    expect(afterColor.phase).toBe('round_end');
    expect(afterColor.winnerId).toBe('p1');
    expect(afterColor.currentColor).toBe('blue');
    expect(afterColor.discardPile.at(-1)).toMatchObject({ id: 'wild_last', chosenColor: 'blue' });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CHALLENGE
// ──────────────────────────────────────────────────────────────────────────────

describe('CHALLENGE - WD4 was legal (challenge fails)', () => {
  it('challenger draws 6 and play advances past challenger', () => {
    // p1 played WD4, p2 is challenging
    // p1 had no red cards (so WD4 was legal)
    const deckCards = Array.from({ length: 10 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 9, id: `d${i}` })
    );
    const state = makeState({
      phase: 'challenging',
      players: [
        {
          id: 'p1', name: 'Alice',
          // p1's hand at time of play - no red cards, WD4 legal
          hand: [makeCard('number', 'blue', { value: 1, id: 'p1c1' })],
          score: 0, connected: true, calledUno: false
        },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      currentPlayerIndex: 0,
      currentColor: 'green',
      pendingDrawPlayerId: 'p2',
      deck: deckCards,
      discardPile: [
        makeCard('number', 'red', { value: 5, id: 'prev_top' }),  // previous top (red)
        makeCard('wild_draw_four', null, { id: 'wd4_card' }),     // WD4 on top
      ],
    });
    const next = applyAction(state, { type: 'CHALLENGE', playerId: 'p2' });
    expect(next.players[1]!.hand).toHaveLength(0);
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.pendingPenaltyDraws).toBe(6);
    const afterPenalty = drawPendingPenalty(next);
    expect(afterPenalty.players[1]!.hand).toHaveLength(6);
    expect(afterPenalty.currentPlayerIndex).toBe(2);
    expect(next.phase).toBe('playing');
    expect(next.pendingDrawPlayerId).toBeNull();
  });
});

describe('CHALLENGE - WD4 was illegal (challenge wins)', () => {
  it('WD4 player draws 4 and play advances', () => {
    const deckCards = Array.from({ length: 10 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 9, id: `d${i}` })
    );
    const state = makeState({
      phase: 'challenging',
      players: [
        {
          id: 'p1', name: 'Alice',
          // p1 has a red card - WD4 was illegal!
          hand: [makeCard('number', 'red', { value: 3, id: 'p1_red' })],
          score: 0, connected: true, calledUno: false
        },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      currentPlayerIndex: 0,
      currentColor: 'green',
      pendingDrawPlayerId: 'p2',
      deck: deckCards,
      discardPile: [
        makeCard('number', 'red', { value: 5, id: 'prev_top' }),
        makeCard('wild_draw_four', null, { id: 'wd4_card' }),
      ],
    });
    const next = applyAction(state, { type: 'CHALLENGE', playerId: 'p2' });
    expect(next.players[0]!.hand).toHaveLength(1);
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.pendingPenaltyDraws).toBe(4);
    const afterPenalty = drawPendingPenalty(next);
    expect(afterPenalty.players[0]!.hand).toHaveLength(5);
    expect(next.phase).toBe('playing');
    expect(next.pendingDrawPlayerId).toBeNull();
  });

  it('uses the previous wild card chosen color when checking legality', () => {
    const deckCards = Array.from({ length: 10 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 9, id: `d${i}` })
    );
    const state = makeState({
      phase: 'challenging',
      players: [
        {
          id: 'p1', name: 'Alice',
          hand: [makeCard('number', 'red', { value: 3, id: 'p1_red' })],
          score: 0, connected: true, calledUno: false
        },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      currentPlayerIndex: 0,
      currentColor: 'green',
      pendingDrawPlayerId: 'p2',
      deck: deckCards,
      discardPile: [
        { id: 'prev_wild', type: 'wild', color: null, chosenColor: 'red' },
        makeCard('wild_draw_four', null, { id: 'wd4_card' }),
      ],
    });

    const next = applyAction(state, { type: 'CHALLENGE', playerId: 'p2' });

    const afterPenalty = drawPendingPenalty(next);
    expect(afterPenalty.players[0]!.hand).toHaveLength(5);
    expect(next.players[1]!.hand).toHaveLength(0);
    expect(next.phase).toBe('playing');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// ACCEPT
// ──────────────────────────────────────────────────────────────────────────────

describe('ACCEPT', () => {
  it('accepter draws 4 and advances past them', () => {
    const deckCards = Array.from({ length: 6 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 9, id: `d${i}` })
    );
    const state = makeState({
      phase: 'challenging',
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      currentPlayerIndex: 0,
      pendingDrawPlayerId: 'p2',
      deck: deckCards,
    });
    const next = applyAction(state, { type: 'ACCEPT', playerId: 'p2' });
    expect(next.players[1]!.hand).toHaveLength(0);
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.pendingPenaltyDraws).toBe(4);
    const afterPenalty = drawPendingPenalty(next);
    expect(afterPenalty.players[1]!.hand).toHaveLength(4);
    expect(afterPenalty.currentPlayerIndex).toBe(2);
    expect(next.phase).toBe('playing');
    expect(next.pendingDrawPlayerId).toBeNull();
  });

  it('rejected when player is not the pending draw player', () => {
    const state = makeState({
      phase: 'challenging',
      pendingDrawPlayerId: 'p2',
    });
    const next = applyAction(state, { type: 'ACCEPT', playerId: 'p3' });
    expect(next).toStrictEqual(state);
  });

  it('ends the round after accepting the penalty from a last-card wild draw four', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4_last' });
    const deckCards = Array.from({ length: 6 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 9, id: `d${i}` })
    );
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [wd4], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'yellow', { value: 4, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      deck: deckCards,
    });

    const afterPlay = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4_last' });
    const afterColor = applyAction(afterPlay, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'green' });
    const afterAccept = applyAction(afterColor, { type: 'ACCEPT', playerId: 'p2' });
    const afterPenalty = drawPendingPenalty(afterAccept);

    expect(afterAccept.phase).toBe('playing');
    expect(afterPenalty.phase).toBe('round_end');
    expect(afterPenalty.winnerId).toBe('p1');
    expect(afterPenalty.players[1]!.hand).toHaveLength(5);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CALL_UNO
// ──────────────────────────────────────────────────────────────────────────────

describe('CALL_UNO', () => {
  it('sets calledUno flag for player with 1 card', () => {
    const state = makeState({
      players: [
        {
          id: 'p1', name: 'Alice',
          hand: [makeCard('number', 'red', { value: 1, id: 'c1' })],
          score: 0, connected: true, calledUno: false
        },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });
    const next = applyAction(state, { type: 'CALL_UNO', playerId: 'p1' });
    expect(next.players[0]!.calledUno).toBe(true);
  });

  it('sets calledUno flag for player with 2 cards', () => {
    const state = makeState({
      players: [
        {
          id: 'p1', name: 'Alice',
          hand: [
            makeCard('number', 'red', { value: 1, id: 'c1' }),
          ],
          score: 0, connected: true, calledUno: false
        },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });
    const next = applyAction(state, { type: 'CALL_UNO', playerId: 'p1' });
    expect(next.players[0]!.calledUno).toBe(true);
  });

  it('does not set flag for player with 2 or more cards', () => {
    const state = makeState({
      players: [
        {
          id: 'p1', name: 'Alice',
          hand: [
            makeCard('number', 'red', { value: 1, id: 'c1' }),
            makeCard('number', 'blue', { value: 2, id: 'c2' }),
          ],
          score: 0, connected: true, calledUno: false
        },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });
    const next = applyAction(state, { type: 'CALL_UNO', playerId: 'p1' });
    expect(next.players[0]!.calledUno).toBe(false);
  });

  it('does not set flag for a player with no cards', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });

    const next = applyAction(state, { type: 'CALL_UNO', playerId: 'p1' });

    expect(next).toStrictEqual(state);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CATCH_UNO
// ──────────────────────────────────────────────────────────────────────────────

describe('CATCH_UNO - uncalled', () => {
  it('target draws 2 when they have 1 card and have not called UNO', () => {
    const deckCards = [
      makeCard('number', 'blue', { value: 1, id: 'dc1' }),
      makeCard('number', 'blue', { value: 2, id: 'dc2' }),
    ];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        {
          id: 'p2', name: 'Bob',
          hand: [makeCard('number', 'red', { value: 5, id: 'p2c1' })],
          score: 0, connected: true, calledUno: false
        },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deck: deckCards,
    });
    const next = applyAction(state, { type: 'CATCH_UNO', catcherId: 'p1', targetId: 'p2' });
    expect(next.players[1]!.hand).toHaveLength(1);
    expect(next.players[1]!.unoCaught).toBe(true);
    expect(next.pendingPenaltyDraws).toBe(2);
    const afterPenalty = drawPendingPenalty(next);
    expect(afterPenalty.players[1]!.hand).toHaveLength(3);
    expect(afterPenalty.players[1]!.unoCaught).toBe(false);
  });

  it('does not apply the same missed UNO penalty more than once', () => {
    const deckCards = [
      makeCard('number', 'blue', { value: 1, id: 'dc1' }),
      makeCard('number', 'blue', { value: 2, id: 'dc2' }),
      makeCard('number', 'green', { value: 3, id: 'dc3' }),
      makeCard('number', 'green', { value: 4, id: 'dc4' }),
    ];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        {
          id: 'p2', name: 'Bob',
          hand: [makeCard('number', 'red', { value: 5, id: 'p2c1' })],
          score: 0, connected: true, calledUno: false,
        },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deck: deckCards,
    });

    const firstCatch = applyAction(state, { type: 'CATCH_UNO', catcherId: 'p1', targetId: 'p2' });
    const secondCatch = applyAction(firstCatch, { type: 'CATCH_UNO', catcherId: 'p3', targetId: 'p2' });

    expect(secondCatch).toStrictEqual(firstCatch);
    const afterPenalty = drawPendingPenalty(secondCatch);
    expect(afterPenalty.players[1]!.hand).toHaveLength(3);
  });
});

describe('CATCH_UNO - already called', () => {
  it('no penalty when target already called UNO', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        {
          id: 'p2', name: 'Bob',
          hand: [makeCard('number', 'red', { value: 5, id: 'p2c1' })],
          score: 0, connected: true, calledUno: true
        },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deck: [makeCard('number', 'blue', { value: 1, id: 'dc1' })],
    });
    const next = applyAction(state, { type: 'CATCH_UNO', catcherId: 'p1', targetId: 'p2' });
    expect(next).toStrictEqual(state);
  });
});

describe('CATCH_UNO - target has more than 1 card', () => {
  it('no catch possible when target has 2 or more cards', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        {
          id: 'p2', name: 'Bob',
          hand: [
            makeCard('number', 'red', { value: 5, id: 'p2c1' }),
            makeCard('number', 'blue', { value: 3, id: 'p2c2' }),
          ],
          score: 0, connected: true, calledUno: false
        },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deck: [makeCard('number', 'blue', { value: 1, id: 'dc1' })],
    });
    const next = applyAction(state, { type: 'CATCH_UNO', catcherId: 'p1', targetId: 'p2' });
    expect(next).toStrictEqual(state);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────────────────────────────────────

describe('DRAW_CARD - reshuffles when deck is empty', () => {
  it('reshuffles discard pile when deck is empty', () => {
    const discardCards = [
      makeCard('number', 'blue', { value: 1, id: 'disc1' }),
      makeCard('number', 'green', { value: 2, id: 'disc2' }),
      makeCard('number', 'red', { value: 5, id: 'discard_top' }),
    ];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deck: [], // empty deck
      discardPile: discardCards,
    });
    const next = applyAction(state, { type: 'DRAW_CARD', playerId: 'p1' });
    expect(next.players[0]!.hand).toHaveLength(1);
  });
});

describe('PLAY_CARD - resets calledUno when playing', () => {
  it('resets calledUno when playing down to 1 card', () => {
    const card = makeCard('number', 'red', { value: 7, id: 'c1' });
    const extraCard = makeCard('number', 'red', { value: 3, id: 'c2' });
    const state = makeState({
      players: [
        {
          id: 'p1', name: 'Alice',
          hand: [card, extraCard],
          score: 0, connected: true, calledUno: true
        },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next.players[0]!.calledUno).toBe(false);
  });

  it('resets calledUno when playing down to more than 1 card', () => {
    const card = makeCard('number', 'red', { value: 7, id: 'c1' });
    const extra1 = makeCard('number', 'red', { value: 3, id: 'c2' });
    const extra2 = makeCard('number', 'blue', { value: 5, id: 'c3' });
    const state = makeState({
      players: [
        {
          id: 'p1', name: 'Alice',
          hand: [card, extra1, extra2],
          score: 0, connected: true, calledUno: true
        },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next.players[0]!.calledUno).toBe(false);
  });
});

describe('PLAY_CARD - last draw_two triggers effect then ends round', () => {
  it('playing last draw_two card: p2 draws 2, then round ends with p1 as winner', () => {
    const card = makeCard('draw_two', 'red', { id: 'c1' });
    const deckCards = [
      makeCard('number', 'blue', { value: 1, id: 'd1' }),
      makeCard('number', 'blue', { value: 2, id: 'd2' }),
    ];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'yellow', { value: 4, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
      deck: deckCards,
    });
    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next.phase).toBe('playing');
    expect(next.pendingPenaltyDraws).toBe(2);
    const afterPenalty = drawPendingPenalty(next);
    expect(afterPenalty.phase).toBe('round_end');
    expect(afterPenalty.winnerId).toBe('p1');
    expect(afterPenalty.players[1]!.hand).toHaveLength(3);
  });
});

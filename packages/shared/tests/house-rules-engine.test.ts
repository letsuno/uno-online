import { describe, it, expect } from 'vitest';
import { applyActionWithHouseRules } from '../src/rules/house-rules-engine';
import type { GameState } from '../src/types/game';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules';
import { makeCard, makeState, drawPendingPenalty as _drawPendingPenalty } from './helpers/test-utils';

function drawPendingPenalty(state: GameState): GameState {
  return _drawPendingPenalty(state, applyActionWithHouseRules);
}

// ──────────────────────────────────────────────────────────────────────────────
// Default behavior (all rules off) matches standard applyAction
// ──────────────────────────────────────────────────────────────────────────────

describe('default house rules — behaves like standard engine', () => {
  it('plays a matching number card and advances turn', () => {
    const card = makeCard('number', 'red', { value: 3, id: 'c1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })], score: 0, connected: true, calledUno: false },
      ],
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.players[0]!.hand).toHaveLength(0);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('c1');
  });

  it('wild card on non-last hand proceeds normally to choosing_color', () => {
    const wild = makeCard('wild', null, { id: 'wild1' });
    const extra = makeCard('number', 'red', { value: 1, id: 'extra' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [wild, extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wild1' });
    expect(next.phase).toBe('choosing_color');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// noWildFinish
// ──────────────────────────────────────────────────────────────────────────────

describe('noWildFinish', () => {
  it('rejects wild as last card', () => {
    const wild = makeCard('wild', null, { id: 'wild1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [wild], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, noWildFinish: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wild1' });
    // State should be returned unchanged (play rejected)
    expect(next.players[0]!.hand).toHaveLength(1);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('discard_top');
  });

  it('rejects wild_draw_four as last card', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [wd4], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, noWildFinish: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4' });
    expect(next.players[0]!.hand).toHaveLength(1);
  });

  it('allows wild when NOT last card', () => {
    const wild = makeCard('wild', null, { id: 'wild1' });
    const extra = makeCard('number', 'red', { value: 9, id: 'extra' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [wild, extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, noWildFinish: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wild1' });
    expect(next.phase).toBe('choosing_color');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// noFunctionCardFinish
// ──────────────────────────────────────────────────────────────────────────────

describe('noFunctionCardFinish', () => {
  it('rejects draw_two as last card', () => {
    const d2 = makeCard('draw_two', 'red', { id: 'd2' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [d2], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, noFunctionCardFinish: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd2' });
    expect(next.players[0]!.hand).toHaveLength(1);
  });

  it('rejects wild_draw_four as last card', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [wd4], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, noFunctionCardFinish: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4' });
    expect(next.players[0]!.hand).toHaveLength(1);
  });

  it('allows draw_two when NOT last card', () => {
    const d2 = makeCard('draw_two', 'red', { id: 'd2' });
    const extra = makeCard('number', 'red', { value: 9, id: 'extra' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [d2, extra], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, noFunctionCardFinish: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd2' });
    // draw_two should be played normally, advancing to p3 (skip p2)
    expect(next.players[0]!.hand).toHaveLength(1);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('d2');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// silentUno
// ──────────────────────────────────────────────────────────────────────────────

describe('silentUno', () => {
  it('CATCH_UNO does nothing when silentUno is enabled', () => {
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
          score: 0, connected: true, calledUno: false,
        },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deckLeft: deckCards,
      deckRight: [],
      deckLeftInitialCount: deckCards.length,
      deckRightInitialCount: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, silentUno: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'CATCH_UNO', catcherId: 'p1', targetId: 'p2' });
    // With silentUno: CATCH_UNO does nothing — p2 still has 1 card
    expect(next.players[1]!.hand).toHaveLength(1);
    expect(next).toStrictEqual(state);
  });

  it('CATCH_UNO works normally when silentUno is disabled', () => {
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
          score: 0, connected: true, calledUno: false,
        },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deckLeft: deckCards,
      deckRight: [],
      deckLeftInitialCount: deckCards.length,
      deckRightInitialCount: 0,
    });
    const next = applyActionWithHouseRules(state, { type: 'CATCH_UNO', catcherId: 'p1', targetId: 'p2' });
    expect(next.pendingPenaltyDraws).toBe(2);
    expect(next.players[1]!.unoCaught).toBe(true);
    const paid = drawPendingPenalty(next);
    expect(paid.players[1]!.hand).toHaveLength(3); // 1 + 2 penalty
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// noChallengeWildFour
// ──────────────────────────────────────────────────────────────────────────────

describe('noChallengeWildFour', () => {
  it('CHALLENGE does nothing when noChallengeWildFour is enabled', () => {
    const deckCards = Array.from({ length: 10 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 9, id: `d${i}` })
    );
    const state = makeState({
      phase: 'challenging',
      players: [
        {
          id: 'p1', name: 'Alice',
          hand: [makeCard('number', 'blue', { value: 1, id: 'p1c1' })],
          score: 0, connected: true, calledUno: false,
        },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      currentPlayerIndex: 0,
      currentColor: 'green',
      pendingDrawPlayerId: 'p2',
      deckLeft: deckCards,
      deckRight: [],
      deckLeftInitialCount: deckCards.length,
      deckRightInitialCount: 0,
      discardPile: [
        makeCard('number', 'red', { value: 5, id: 'prev_top' }),
        makeCard('wild_draw_four', null, { id: 'wd4_card' }),
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, noChallengeWildFour: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'CHALLENGE', playerId: 'p2' });
    // CHALLENGE should do nothing — state unchanged
    expect(next).toStrictEqual(state);
  });

  it('CHALLENGE works normally when noChallengeWildFour is disabled', () => {
    const deckCards = Array.from({ length: 10 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 9, id: `d${i}` })
    );
    const state = makeState({
      phase: 'challenging',
      players: [
        {
          id: 'p1', name: 'Alice',
          hand: [makeCard('number', 'blue', { value: 1, id: 'p1c1' })],
          score: 0, connected: true, calledUno: false,
        },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      currentPlayerIndex: 0,
      currentColor: 'green',
      pendingDrawPlayerId: 'p2',
      deckLeft: deckCards,
      deckRight: [],
      deckLeftInitialCount: deckCards.length,
      deckRightInitialCount: 0,
      discardPile: [
        makeCard('number', 'red', { value: 5, id: 'prev_top' }),
        makeCard('wild_draw_four', null, { id: 'wd4_card' }),
      ],
    });
    const next = applyActionWithHouseRules(state, { type: 'CHALLENGE', playerId: 'p2' });
    // Should process the challenge (p2 draws 6 since WD4 was legal — p1 had no red)
    expect(next.phase).toBe('playing');
    expect(next.pendingPenaltyDraws).toBe(6);
    const paid = drawPendingPenalty(next);
    expect(paid.players[1]!.hand).toHaveLength(6);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// unoPenaltyCount
// ──────────────────────────────────────────────────────────────────────────────

describe('unoPenaltyCount', () => {
  it('draws 6 cards when unoPenaltyCount=6', () => {
    const deckCards = Array.from({ length: 10 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 10, id: `dc_${i}` })
    );
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
      deckLeft: deckCards,
      deckRight: [],
      deckLeftInitialCount: deckCards.length,
      deckRightInitialCount: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, unoPenaltyCount: 6 },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'CATCH_UNO', catcherId: 'p1', targetId: 'p2' });
    expect(next.pendingPenaltyDraws).toBe(6);
    const paid = drawPendingPenalty(next);
    expect(paid.players[1]!.hand).toHaveLength(7); // 1 + 6 penalty
  });

  it('draws 4 cards when unoPenaltyCount=4', () => {
    const deckCards = Array.from({ length: 10 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 10, id: `dc_${i}` })
    );
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
      deckLeft: deckCards,
      deckRight: [],
      deckLeftInitialCount: deckCards.length,
      deckRightInitialCount: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, unoPenaltyCount: 4 },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'CATCH_UNO', catcherId: 'p1', targetId: 'p2' });
    expect(next.pendingPenaltyDraws).toBe(4);
    const paid = drawPendingPenalty(next);
    expect(paid.players[1]!.hand).toHaveLength(5); // 1 + 4 penalty
  });

  it('draws 2 cards (default) when unoPenaltyCount=2', () => {
    const deckCards = Array.from({ length: 10 }, (_, i) =>
      makeCard('number', 'blue', { value: i % 10, id: `dc_${i}` })
    );
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
      deckLeft: deckCards,
      deckRight: [],
      deckLeftInitialCount: deckCards.length,
      deckRightInitialCount: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, unoPenaltyCount: 2 },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'CATCH_UNO', catcherId: 'p1', targetId: 'p2' });
    expect(next.pendingPenaltyDraws).toBe(2);
    const paid = drawPendingPenalty(next);
    expect(paid.players[1]!.hand).toHaveLength(3); // 1 + 2 penalty
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// doubleScore
// ──────────────────────────────────────────────────────────────────────────────

describe('doubleScore', () => {
  it('doubles winner score on round end', () => {
    // p2 and p3 each have cards worth points
    // p1 plays last card — winning the round
    const card = makeCard('number', 'red', { value: 0, id: 'c1' });
    const p2card = makeCard('number', 'yellow', { value: 5, id: 'p2c' }); // worth 5 pts
    const p3card = makeCard('number', 'green', { value: 3, id: 'p3c' }); // worth 3 pts
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [p2card], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [p3card], score: 0, connected: true, calledUno: false },
      ],
      deckLeft: [makeCard('number', 'blue', { value: 1, id: 'd1' })],
      deckRight: [],
      deckLeftInitialCount: 1,
      deckRightInitialCount: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, doubleScore: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next.phase).toBe('round_end');
    // p2 has 5 + p3 has 3 = 8 pts, doubled = 16
    const winner = next.players.find(p => p.id === 'p1')!;
    expect(winner.score).toBe(16);
  });

  it('does NOT double score when doubleScore is off', () => {
    const card = makeCard('number', 'red', { value: 0, id: 'c1' });
    const p2card = makeCard('number', 'yellow', { value: 5, id: 'p2c' }); // worth 5 pts
    const p3card = makeCard('number', 'green', { value: 3, id: 'p3c' }); // worth 3 pts
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [p2card], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [p3card], score: 0, connected: true, calledUno: false },
      ],
      deckLeft: [makeCard('number', 'blue', { value: 1, id: 'd1' })],
      deckRight: [],
      deckLeftInitialCount: 1,
      deckRightInitialCount: 0,
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'c1' });
    expect(next.phase).toBe('round_end');
    const winner = next.players.find(p => p.id === 'p1')!;
    expect(winner.score).toBe(8); // 5 + 3, not doubled
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// drawUntilPlayable
// ──────────────────────────────────────────────────────────────────────────────

describe('drawUntilPlayable', () => {
  it('draws one card at a time until a playable card is found', () => {
    // Current color is red. Deck has non-playable blue cards, then a red card.
    const deck = [
      makeCard('number', 'blue', { value: 1, id: 'blue1' }),
      makeCard('number', 'blue', { value: 2, id: 'blue2' }),
      makeCard('number', 'red', { value: 7, id: 'red7' }), // playable!
    ];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'discard_top' })],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, drawUntilPlayable: true },
      },
    });
    const afterFirstDraw = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });
    expect(afterFirstDraw.players[0]!.hand.map(c => c.id)).toEqual(['blue1']);

    const rejectedPass = applyActionWithHouseRules(afterFirstDraw, { type: 'PASS', playerId: 'p1' });
    expect(rejectedPass).toStrictEqual(afterFirstDraw);

    const afterSecondDraw = applyActionWithHouseRules(afterFirstDraw, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });
    expect(afterSecondDraw.players[0]!.hand.map(c => c.id)).toEqual(['blue1', 'blue2']);

    const afterThirdDraw = applyActionWithHouseRules(afterSecondDraw, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });
    expect(afterThirdDraw.players[0]!.hand.map(c => c.id)).toEqual(['blue1', 'blue2', 'red7']);
  });

  it('draws single card if first drawn card is playable', () => {
    const deck = [
      makeCard('number', 'red', { value: 7, id: 'red7' }), // immediately playable
      makeCard('number', 'blue', { value: 1, id: 'blue1' }),
    ];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'discard_top' })],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, drawUntilPlayable: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });
    expect(next.players[0]!.hand).toHaveLength(1);
    expect(next.players[0]!.hand[0]!.id).toBe('red7');
  });

  it('rejects drawing when the player already has a playable card', () => {
    const deck = [
      makeCard('number', 'blue', { value: 1, id: 'blue1' }),
    ];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'red', { value: 9, id: 'red9' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'discard_top' })],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, drawUntilPlayable: true },
      },
    });

    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });

    expect(next).toStrictEqual(state);
  });

  it('keeps +2 penalty draws active until both cards are drawn', () => {
    const state = makeState({
      currentPlayerIndex: 1,
      pendingPenaltyDraws: 2,
      pendingPenaltyNextPlayerIndex: 2,
      pendingPenaltySourcePlayerId: 'p1',
      deckLeft: [
        makeCard('number', 'red', { value: 7, id: 'drawn_red' }),
        makeCard('number', 'blue', { value: 1, id: 'drawn_blue' }),
      ],
      deckRight: [],
      deckLeftInitialCount: 2,
      deckRightInitialCount: 0,
      currentColor: 'red',
      discardPile: [makeCard('draw_two', 'red', { id: 'discard_d2' })],
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, drawUntilPlayable: true },
      },
    });

    const afterFirstDraw = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' as const });
    expect(afterFirstDraw.players[1]!.hand.map(c => c.id)).toEqual(['drawn_red']);
    expect(afterFirstDraw.pendingPenaltyDraws).toBe(1);
    expect(afterFirstDraw.currentPlayerIndex).toBe(1);

    const passAttempt = applyActionWithHouseRules(afterFirstDraw, { type: 'PASS', playerId: 'p2' });
    expect(passAttempt).toStrictEqual(afterFirstDraw);

    const afterSecondDraw = applyActionWithHouseRules(afterFirstDraw, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' as const });
    expect(afterSecondDraw.players[1]!.hand.map(c => c.id)).toEqual(['drawn_red', 'drawn_blue']);
    expect(afterSecondDraw.pendingPenaltyDraws).toBe(0);
    expect(afterSecondDraw.currentPlayerIndex).toBe(2);
  });

  it('standard DRAW_CARD draws only 1 card without drawUntilPlayable', () => {
    const deck = [
      makeCard('number', 'blue', { value: 1, id: 'blue1' }),
      makeCard('number', 'blue', { value: 2, id: 'blue2' }),
      makeCard('number', 'red', { value: 7, id: 'red7' }),
    ];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      currentColor: 'red',
    });
    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });
    expect(next.players[0]!.hand).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// forcedPlayAfterDraw
// ──────────────────────────────────────────────────────────────────────────────

describe('forcedPlayAfterDraw', () => {
  it('auto-plays drawn card if playable after drawing', () => {
    const playableCard = makeCard('number', 'red', { value: 7, id: 'red7' });
    const deck = [playableCard];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'discard_top' })],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, forcedPlayAfterDraw: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });
    // The card should have been automatically played — p1's hand should be empty and it's p2's turn
    expect(next.players[0]!.hand).toHaveLength(0);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('red7');
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('does NOT auto-play if drawn card is not playable', () => {
    const unplayableCard = makeCard('number', 'blue', { value: 3, id: 'blue3' });
    const deck = [unplayableCard];
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      currentColor: 'red',
      discardPile: [makeCard('number', 'red', { value: 5, id: 'discard_top' })],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, forcedPlayAfterDraw: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const });
    // Card can't be played, stays in hand
    expect(next.players[0]!.hand).toHaveLength(1);
    expect(next.players[0]!.hand[0]!.id).toBe('blue3');
    expect(next.currentPlayerIndex).toBe(0); // still p1's turn
  });
});

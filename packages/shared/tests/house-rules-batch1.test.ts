import { describe, it, expect } from 'vitest';
import { handleFirstDiscard } from '../src/rules/setup';
import { applyActionWithHouseRules } from '../src/rules/house-rules-engine';
import type { GameState } from '../src/types/game';
import type { Card } from '../src/types/card';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules';
import { makeCard, makeState, drawPendingPenalty as _drawPendingPenalty } from './helpers/test-utils';

function drawPendingPenalty(state: GameState): GameState {
  return _drawPendingPenalty(state, applyActionWithHouseRules);
}

// ──────────────────────────────────────────────────────────────────────────────
// wildFirstTurn — handleFirstDiscard with skipWild
// ──────────────────────────────────────────────────────────────────────────────

describe('wildFirstTurn (handleFirstDiscard skipWild)', () => {
  it('skips wild cards when skipWild is true', () => {
    const deck: Card[] = [
      makeCard('wild', null, { id: 'w1' }),
      makeCard('wild', null, { id: 'w2' }),
      makeCard('number', 'red', { value: 3, id: 'r3' }),
    ];
    const result = handleFirstDiscard(deck, true);
    // Both wilds should be skipped, r3 used as first discard
    expect(result.topCard.id).toBe('r3');
    expect(result.effect).toBeNull();
    // Wilds should have been pushed to the back of the remaining deck
    expect(result.remainingDeck).toHaveLength(2);
    expect(result.remainingDeck[0]!.id).toBe('w1');
    expect(result.remainingDeck[1]!.id).toBe('w2');
  });

  it('allows wild cards when skipWild is false', () => {
    const deck: Card[] = [
      makeCard('wild', null, { id: 'w1' }),
      makeCard('number', 'red', { value: 3, id: 'r3' }),
    ];
    const result = handleFirstDiscard(deck, false);
    expect(result.topCard.id).toBe('w1');
    expect(result.effect).toEqual({ type: 'choose_color' });
  });

  it('allows wild cards when skipWild is undefined (default)', () => {
    const deck: Card[] = [
      makeCard('wild', null, { id: 'w1' }),
      makeCard('number', 'red', { value: 3, id: 'r3' }),
    ];
    const result = handleFirstDiscard(deck);
    expect(result.topCard.id).toBe('w1');
    expect(result.effect).toEqual({ type: 'choose_color' });
  });

  it('always skips wild_draw_four regardless of skipWild', () => {
    const deck: Card[] = [
      makeCard('wild_draw_four', null, { id: 'wd4' }),
      makeCard('number', 'blue', { value: 7, id: 'b7' }),
    ];
    const result = handleFirstDiscard(deck, false);
    expect(result.topCard.id).toBe('b7');
  });

  it('skips both wild and wild_draw_four when skipWild is true', () => {
    const deck: Card[] = [
      makeCard('wild_draw_four', null, { id: 'wd4' }),
      makeCard('wild', null, { id: 'w1' }),
      makeCard('number', 'green', { value: 1, id: 'g1' }),
    ];
    const result = handleFirstDiscard(deck, true);
    expect(result.topCard.id).toBe('g1');
    expect(result.remainingDeck).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────
// revengeMode — counter-attack doubles draw penalty
// ──────────────────────────────────────────────────────────────────────────────

describe('revengeMode', () => {
  it('doubles draw penalty when counter-attacking with draw_two after draw_two', () => {
    const d2 = makeCard('draw_two', 'red', { id: 'd2_play' });
    const state = makeState({
      players: [
        {
          id: 'p1', name: 'Alice',
          hand: [d2, makeCard('number', 'red', { value: 1, id: 'extra' })],
          score: 0, connected: true, calledUno: false,
        },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      // Previous top card is a draw_two (someone attacked p1)
      discardPile: [makeCard('draw_two', 'red', { id: 'prev_d2' })],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd2_play' });
    // Base engine draws 2 for p2, revengeMode draws 2 more = 4 total
    // p2 started with 1 card, so should now have 5
    expect(next.pendingPenaltyDraws).toBe(2);
    expect(next.pendingPenaltyQueue).toHaveLength(1);
    const paid = drawPendingPenalty(next);
    expect(paid.players[1]!.hand).toHaveLength(5);
  });

  it('doubles draw penalty when counter-attacking with wild_draw_four after draw_two', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4_play' });
    const state = makeState({
      players: [
        {
          id: 'p1', name: 'Alice',
          hand: [wd4, makeCard('number', 'red', { value: 1, id: 'extra' })],
          score: 0, connected: true, calledUno: false,
        },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      discardPile: [makeCard('draw_two', 'red', { id: 'prev_d2' })],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4_play', chosenColor: 'blue' });
    // wild_draw_four goes to choosing_color phase; revengeMode adds 4 to drawStack
    expect(next.drawStack).toBe(4);
    expect(next).not.toStrictEqual(state);
  });

  it('does NOT double when previous card is not an attack card', () => {
    const d2 = makeCard('draw_two', 'red', { id: 'd2_play' });
    const state = makeState({
      players: [
        {
          id: 'p1', name: 'Alice',
          hand: [d2, makeCard('number', 'red', { value: 1, id: 'extra' })],
          score: 0, connected: true, calledUno: false,
        },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      // Previous top card is a normal number card (no attack)
      discardPile: [makeCard('number', 'red', { value: 5, id: 'normal_card' })],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true },
      },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd2_play' });
    // Normal draw_two: p2 draws 2 (started with 1 -> 3), no doubling
    expect(next.pendingPenaltyDraws).toBe(2);
    const paid = drawPendingPenalty(next);
    expect(paid.players[1]!.hand).toHaveLength(3);
  });

  it('does NOT double when revengeMode is disabled', () => {
    const d2 = makeCard('draw_two', 'red', { id: 'd2_play' });
    const state = makeState({
      players: [
        {
          id: 'p1', name: 'Alice',
          hand: [d2, makeCard('number', 'red', { value: 1, id: 'extra' })],
          score: 0, connected: true, calledUno: false,
        },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, calledUno: false },
      ],
      discardPile: [makeCard('draw_two', 'red', { id: 'prev_d2' })],
      currentColor: 'red',
      // revengeMode is false (default)
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd2_play' });
    // Standard draw_two: p2 draws 2 (started with 1 -> 3), no revenge doubling
    expect(next.pendingPenaltyDraws).toBe(2);
    const paid = drawPendingPenalty(next);
    expect(paid.players[1]!.hand).toHaveLength(3);
  });
});

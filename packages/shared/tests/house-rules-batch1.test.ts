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
    const deck: Card[] = [makeCard('wild', null, { id: 'w1' }), makeCard('number', 'red', { value: 3, id: 'r3' })];
    const result = handleFirstDiscard(deck, false);
    expect(result.topCard.id).toBe('w1');
    expect(result.effect).toEqual({ type: 'choose_color' });
  });

  it('allows wild cards when skipWild is undefined (default)', () => {
    const deck: Card[] = [makeCard('wild', null, { id: 'w1' }), makeCard('number', 'red', { value: 3, id: 'r3' })];
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
          id: 'p1',
          name: 'Alice',
          hand: [d2, makeCard('number', 'red', { value: 1, id: 'extra' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
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
          id: 'p1',
          name: 'Alice',
          hand: [wd4, makeCard('number', 'red', { value: 1, id: 'extra' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
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
    const next = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'wd4_play',
      chosenColor: 'blue',
    });
    // The revenge bonus waits for the WD4 challenge flow to determine who pays.
    expect(next.drawStack).toBe(0);
    expect(next.pendingRevengeDraws).toBe(4);
    expect(next).not.toStrictEqual(state);
  });

  it('consumes the revenge WD4 bonus during accept without using drawStack', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4_play' });
    const deck = Array.from({ length: 12 }, (_, i) =>
      makeCard('number', 'green', { value: i % 10, id: `revenge-deck-${i}` }),
    );
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [wd4, makeCard('number', 'red', { value: 1, id: 'extra' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p3',
          name: 'Carol',
          hand: [makeCard('number', 'green', { value: 2, id: 'p3c' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
      ],
      discardPile: [makeCard('draw_two', 'red', { id: 'prev_d2' })],
      currentColor: 'red',
      deckLeft: deck,
      deckRight: [],
      deckLeftInitialCount: deck.length,
      deckRightInitialCount: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true },
      },
    });

    const played = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'wd4_play',
    });
    expect(played.drawStack).toBe(0);
    expect(played.pendingRevengeDraws).toBe(4);
    const colored = applyActionWithHouseRules(played, {
      type: 'CHOOSE_COLOR',
      playerId: 'p1',
      color: 'blue',
    });
    const accepted = applyActionWithHouseRules(colored, { type: 'ACCEPT', playerId: 'p2' });

    expect(accepted.drawStack).toBe(0);
    expect(accepted.pendingRevengeDraws).toBe(0);
    expect(accepted.pendingPenaltyDraws).toBe(8);
    const paid = drawPendingPenalty(accepted);
    expect(paid.drawStack).toBe(0);
    expect(paid.players[1]!.hand).toHaveLength(9);
    expect(paid.currentPlayerIndex).toBe(2);
  });

  it('applies the revenge WD4 bonus when challenges are disabled', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4-no-challenge' });
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [wd4, makeCard('number', 'red', { value: 1, id: 'p1-extra' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [makeCard('number', 'blue', { value: 1, id: 'p2-card' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p3',
          name: 'Carol',
          hand: [makeCard('number', 'green', { value: 2, id: 'p3-card' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
      ],
      discardPile: [makeCard('draw_two', 'red', { id: 'previous-attack' })],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: {
          ...DEFAULT_HOUSE_RULES,
          revengeMode: true,
          noChallengeWildFour: true,
        },
      },
    });

    const played = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: wd4.id,
    });
    const colored = applyActionWithHouseRules(played, {
      type: 'CHOOSE_COLOR',
      playerId: 'p1',
      color: 'blue',
    });

    expect(colored.phase).toBe('playing');
    expect(colored.drawStack).toBe(0);
    expect(colored.pendingRevengeDraws).toBe(0);
    expect(colored.pendingPenaltyDraws).toBe(8);
    expect(colored.players[colored.currentPlayerIndex]!.id).toBe('p2');
  });

  it('applies the revenge WD4 bonus when a reverse deflects the challenge', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4-deflect' });
    const reverse = makeCard('reverse', 'blue', { id: 'reverse-deflect' });
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [wd4, makeCard('number', 'red', { value: 1, id: 'p1-extra' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [reverse, makeCard('number', 'yellow', { value: 1, id: 'p2-extra' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p3',
          name: 'Carol',
          hand: [makeCard('number', 'green', { value: 2, id: 'p3-card' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
      ],
      discardPile: [makeCard('draw_two', 'red', { id: 'previous-attack' })],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: {
          ...DEFAULT_HOUSE_RULES,
          revengeMode: true,
          reverseDeflectDrawFour: true,
        },
      },
    });

    const played = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: wd4.id,
    });
    const colored = applyActionWithHouseRules(played, {
      type: 'CHOOSE_COLOR',
      playerId: 'p1',
      color: 'blue',
    });
    const deflected = applyActionWithHouseRules(colored, {
      type: 'PLAY_CARD',
      playerId: 'p2',
      cardId: reverse.id,
    });

    expect(deflected.phase).toBe('playing');
    expect(deflected.drawStack).toBe(0);
    expect(deflected.pendingRevengeDraws).toBe(0);
    expect(deflected.pendingPenaltyDraws).toBe(8);
    expect(deflected.players[deflected.currentPlayerIndex]!.id).toBe('p1');
    expect(deflected.discardPile.at(-1)?.type).toBe('reverse');
  });

  it('applies the revenge WD4 bonus when a skip deflects the challenge', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4-skip-deflect' });
    const skip = makeCard('skip', 'blue', { id: 'skip-deflect' });
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [wd4, makeCard('number', 'red', { value: 1, id: 'p1-extra' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [skip, makeCard('number', 'yellow', { value: 1, id: 'p2-extra' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p3',
          name: 'Carol',
          hand: [makeCard('number', 'green', { value: 2, id: 'p3-card' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
      ],
      discardPile: [makeCard('draw_two', 'red', { id: 'previous-attack' })],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: {
          ...DEFAULT_HOUSE_RULES,
          revengeMode: true,
          skipDeflect: true,
        },
      },
    });

    const played = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: wd4.id,
    });
    const colored = applyActionWithHouseRules(played, {
      type: 'CHOOSE_COLOR',
      playerId: 'p1',
      color: 'blue',
    });
    const deflected = applyActionWithHouseRules(colored, {
      type: 'PLAY_CARD',
      playerId: 'p2',
      cardId: skip.id,
    });

    expect(deflected.phase).toBe('playing');
    expect(deflected.drawStack).toBe(0);
    expect(deflected.pendingRevengeDraws).toBe(0);
    expect(deflected.pendingPenaltyDraws).toBe(8);
    expect(deflected.players[deflected.currentPlayerIndex]!.id).toBe('p3');
    expect(deflected.pendingPenaltyNextPlayerIndex).toBe(0);
  });

  it('adds the revenge bonus to a successful challenge penalty', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4-illegal' });
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [wd4, makeCard('number', 'red', { value: 1, id: 'matching-color' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [makeCard('number', 'blue', { value: 1, id: 'p2-card' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p3',
          name: 'Carol',
          hand: [makeCard('number', 'green', { value: 2, id: 'p3-card' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
      ],
      discardPile: [makeCard('draw_two', 'red', { id: 'previous-attack' })],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true },
      },
    });

    const played = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: wd4.id,
    });
    const colored = applyActionWithHouseRules(played, {
      type: 'CHOOSE_COLOR',
      playerId: 'p1',
      color: 'blue',
    });
    const challenged = applyActionWithHouseRules(colored, {
      type: 'CHALLENGE',
      playerId: 'p2',
    });

    expect(challenged.lastAction).toMatchObject({
      type: 'CHALLENGE',
      succeeded: true,
      penaltyPlayerId: 'p1',
      penaltyCount: 8,
    });
    expect(challenged.pendingPenaltyDraws).toBe(8);
    expect(challenged.pendingRevengeDraws).toBe(0);
    expect(challenged.players[challenged.currentPlayerIndex]!.id).toBe('p1');
  });

  it('adds the revenge bonus to a failed challenge penalty', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4-legal' });
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [wd4, makeCard('number', 'blue', { value: 1, id: 'different-color' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [makeCard('number', 'yellow', { value: 1, id: 'p2-card' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p3',
          name: 'Carol',
          hand: [makeCard('number', 'green', { value: 2, id: 'p3-card' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
      ],
      discardPile: [makeCard('draw_two', 'red', { id: 'previous-attack' })],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true },
      },
    });

    const played = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: wd4.id,
    });
    const colored = applyActionWithHouseRules(played, {
      type: 'CHOOSE_COLOR',
      playerId: 'p1',
      color: 'green',
    });
    const challenged = applyActionWithHouseRules(colored, {
      type: 'CHALLENGE',
      playerId: 'p2',
    });

    expect(challenged.lastAction).toMatchObject({
      type: 'CHALLENGE',
      succeeded: false,
      penaltyPlayerId: 'p2',
      penaltyCount: 10,
    });
    expect(challenged.pendingPenaltyDraws).toBe(10);
    expect(challenged.pendingRevengeDraws).toBe(0);
    expect(challenged.players[challenged.currentPlayerIndex]!.id).toBe('p2');
  });

  it('folds an unresolved revenge WD4 bonus into the actual stack when counter-stacking', () => {
    const firstWd4 = makeCard('wild_draw_four', null, { id: 'wd4-first' });
    const counterWd4 = makeCard('wild_draw_four', null, { id: 'wd4-counter' });
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [firstWd4, makeCard('number', 'red', { value: 1, id: 'p1-extra' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [counterWd4, makeCard('number', 'yellow', { value: 1, id: 'p2-extra' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p3',
          name: 'Carol',
          hand: [makeCard('number', 'green', { value: 2, id: 'p3-card' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
      ],
      discardPile: [makeCard('draw_two', 'red', { id: 'previous-attack' })],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: {
          ...DEFAULT_HOUSE_RULES,
          revengeMode: true,
          stackDrawFour: true,
        },
      },
    });

    const played = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: firstWd4.id,
    });
    const colored = applyActionWithHouseRules(played, {
      type: 'CHOOSE_COLOR',
      playerId: 'p1',
      color: 'blue',
    });
    const countered = applyActionWithHouseRules(colored, {
      type: 'PLAY_CARD',
      playerId: 'p2',
      cardId: counterWd4.id,
      chosenColor: 'green',
    });

    expect(countered.phase).toBe('playing');
    expect(countered.pendingRevengeDraws).toBe(0);
    expect(countered.pendingPenaltyDraws).toBe(0);
    // Previous WD4 (4) + its revenge bonus (4) + the newly stacked WD4 (4).
    // Stacking itself does not trigger a second revenge post-process.
    expect(countered.drawStack).toBe(12);
    expect(countered.players[countered.currentPlayerIndex]!.id).toBe('p3');
  });

  it('rejects a counter-stacked WD4 without an inline color', () => {
    const firstWd4 = makeCard('wild_draw_four', null, { id: 'wd4-first-uncolored' });
    const counterWd4 = makeCard('wild_draw_four', null, { id: 'wd4-counter-uncolored' });
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [firstWd4, makeCard('number', 'red', { value: 1, id: 'p1-extra-uncolored' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [counterWd4, makeCard('number', 'yellow', { value: 1, id: 'p2-extra-uncolored' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p3',
          name: 'Carol',
          hand: [makeCard('number', 'green', { value: 2, id: 'p3-card-uncolored' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: {
          ...DEFAULT_HOUSE_RULES,
          stackDrawFour: true,
        },
      },
    });
    const played = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: firstWd4.id,
    });
    const challenged = applyActionWithHouseRules(played, {
      type: 'CHOOSE_COLOR',
      playerId: 'p1',
      color: 'blue',
    });
    const rejected = applyActionWithHouseRules(challenged, {
      type: 'PLAY_CARD',
      playerId: 'p2',
      cardId: counterWd4.id,
    });

    expect(rejected).toBe(challenged);
    expect(rejected.phase).toBe('challenging');
    expect(rejected.players[1]!.hand.map(card => card.id)).toContain(counterWd4.id);
  });

  it('does not create a parallel revenge penalty during draw-two stacking', () => {
    const drawTwo = makeCard('draw_two', 'red', { id: 'draw-two-counter' });
    const state = makeState({
      drawStack: 2,
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [drawTwo, makeCard('number', 'red', { value: 1, id: 'p1-extra' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [makeCard('number', 'blue', { value: 1, id: 'p2-card' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p3',
          name: 'Carol',
          hand: [makeCard('number', 'green', { value: 2, id: 'p3-card' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
      ],
      discardPile: [makeCard('draw_two', 'red', { id: 'previous-attack' })],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: {
          ...DEFAULT_HOUSE_RULES,
          revengeMode: true,
          stackDrawTwo: true,
        },
      },
    });

    const countered = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: drawTwo.id,
    });

    expect(countered.drawStack).toBe(4);
    expect(countered.pendingPenaltyDraws).toBe(0);
    expect(countered.pendingPenaltyQueue).toHaveLength(0);
  });

  it('does not leave a revenge obligation after the attack card ends the round', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'winning-wd4' });
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [wd4],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [makeCard('number', 'blue', { value: 1, id: 'p2-card' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p3',
          name: 'Carol',
          hand: [makeCard('number', 'green', { value: 2, id: 'p3-card' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
      ],
      discardPile: [makeCard('draw_two', 'red', { id: 'previous-attack' })],
      currentColor: 'red',
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true },
      },
    });

    const won = applyActionWithHouseRules(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: wd4.id,
    });

    expect(won.phase).toBe('round_end');
    expect(won.winnerId).toBe('p1');
    expect(won.pendingRevengeDraws).toBe(0);
    expect(won.drawStack).toBe(0);
    expect(won.pendingPenaltyDraws).toBe(0);
  });

  it('does NOT double when previous card is not an attack card', () => {
    const d2 = makeCard('draw_two', 'red', { id: 'd2_play' });
    const state = makeState({
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [d2, makeCard('number', 'red', { value: 1, id: 'extra' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
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
          id: 'p1',
          name: 'Alice',
          hand: [d2, makeCard('number', 'red', { value: 1, id: 'extra' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })],
          score: 0,
          connected: true,
          calledUno: false,
        },
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

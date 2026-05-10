import { describe, it, expect } from 'vitest';
import { applyActionWithHouseRules } from '../src/rules/house-rules-engine';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules';
import { makeCard, makeState } from './helpers/test-utils';

describe('reverseDeflectDrawTwo', () => {
  it('deflects +2 penalty by playing Reverse', () => {
    const rev = makeCard('reverse', 'red', { id: 'rev1' });
    const dt = makeCard('draw_two', 'red', { id: 'dt1' });
    const state = makeState({
      drawStack: 2,
      currentPlayerIndex: 1,
      discardPile: [makeCard('number', 'blue', { value: 1 }), dt],
      currentColor: 'red',
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [rev, makeCard('number', 'green', { value: 3 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, reverseDeflectDrawTwo: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'rev1' });
    expect(next.direction).not.toBe(state.direction);
    expect(next.drawStack).toBe(2);
    expect(next.players[1]!.hand).toHaveLength(1);
  });

  it('does not deflect when rule is disabled (standard engine processes it normally)', () => {
    const rev = makeCard('reverse', 'red', { id: 'rev2' });
    const dt = makeCard('draw_two', 'red', { id: 'dt2' });
    const state = makeState({
      drawStack: 2,
      currentPlayerIndex: 1,
      discardPile: [makeCard('number', 'blue', { value: 1 }), dt],
      currentColor: 'red',
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [rev, makeCard('number', 'green', { value: 3 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, reverseDeflectDrawTwo: false } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'rev2' });
    // Without the deflect rule, drawStack is unchanged (it's not a stack play either)
    // and the direction reverses via standard engine
    expect(next.drawStack).toBe(2); // drawStack unchanged — not deflected, not stacked
    expect(next.direction).toBe('counter_clockwise'); // standard reverse applied
  });
});

describe('reverseDeflectDrawFour', () => {
  it('deflects +4 penalty by playing Reverse', () => {
    const rev = makeCard('reverse', 'red', { id: 'rev3' });
    const wdf = makeCard('wild_draw_four', null, { id: 'wdf1' });
    const state = makeState({
      drawStack: 4,
      currentPlayerIndex: 1,
      discardPile: [makeCard('number', 'blue', { value: 1 }), wdf],
      currentColor: 'red',
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [rev, makeCard('number', 'green', { value: 3 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, reverseDeflectDrawFour: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'rev3' });
    expect(next.direction).not.toBe(state.direction);
    expect(next.drawStack).toBe(4);
    expect(next.players[1]!.hand).toHaveLength(1);
  });
});

describe('skipDeflect', () => {
  it('deflects penalty by playing Skip', () => {
    const skip = makeCard('skip', 'red', { id: 'skip1' });
    const dt = makeCard('draw_two', 'red', { id: 'dt3' });
    const state = makeState({
      drawStack: 2,
      currentPlayerIndex: 1,
      discardPile: [makeCard('number', 'blue', { value: 1 }), dt],
      currentColor: 'red',
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [skip, makeCard('number', 'green', { value: 3 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, skipDeflect: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'skip1' });
    expect(next.drawStack).toBe(2);
    // After skip deflect, currentPlayerIndex should advance to p3 (index 2)
    expect(next.currentPlayerIndex).toBe(2);
    expect(next.players[1]!.hand).toHaveLength(1);
  });
});

describe('jumpIn', () => {
  it('allows out-of-turn play with exact matching card', () => {
    const matchCard = makeCard('number', 'red', { value: 5, id: 'jump1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [matchCard, makeCard('number', 'green', { value: 3 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, jumpIn: true } },
    });
    // p2 jumps in on p1's turn with exact match (red 5)
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'jump1' });
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('jump1');
    expect(next.players[1]!.hand).toHaveLength(1);
  });

  it('enters color choosing when jumping in with a wild card', () => {
    const topWild = makeCard('wild', null, { id: 'top_wild' });
    const jumpWild = makeCard('wild', null, { id: 'jump_wild' });
    const state = makeState({
      currentPlayerIndex: 0,
      currentColor: 'red',
      discardPile: [topWild],
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'red', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [jumpWild, makeCard('number', 'blue', { value: 3 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, jumpIn: true } },
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'jump_wild' });

    expect(next.phase).toBe('choosing_color');
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.discardPile.at(-1)?.id).toBe('jump_wild');
  });

  it('ends the round immediately when jump-in empties a hand', () => {
    const matchCard = makeCard('number', 'red', { value: 5, id: 'last_jump' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [matchCard], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, jumpIn: true } },
    });

    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'last_jump' });

    expect(next.phase).toBe('round_end');
    expect(next.winnerId).toBe('p2');
  });

  it('rejects out-of-turn play without exact match', () => {
    const noMatch = makeCard('number', 'red', { value: 3, id: 'nope' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [noMatch], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, jumpIn: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'nope' });
    expect(next).toBe(state);
  });

  it('rejects out-of-turn play when jumpIn is disabled', () => {
    const matchCard = makeCard('number', 'red', { value: 5, id: 'jump2' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [matchCard], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, jumpIn: false } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'jump2' });
    // Without jumpIn, out-of-turn play should be rejected by standard engine
    expect(next).toBe(state);
  });
});

describe('sevenSwapHands', () => {
  it('enters choosing_swap_target phase after playing 7, then swaps on target selection', () => {
    const seven = makeCard('number', 'red', { value: 7, id: 'seven1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [seven, makeCard('number', 'blue', { value: 1, id: 'a1' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 2, id: 'b1' }), makeCard('number', 'yellow', { value: 3, id: 'b2' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 4, id: 'c1' })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, sevenSwapHands: true } },
    });
    const afterPlay = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'seven1' });
    expect(afterPlay.phase).toBe('choosing_swap_target');
    expect(afterPlay.currentPlayerIndex).toBe(0);

    const afterSwap = applyActionWithHouseRules(afterPlay, { type: 'CHOOSE_SWAP_TARGET', playerId: 'p1', targetId: 'p3' });
    expect(afterSwap.phase).toBe('playing');
    expect(afterSwap.players[0]!.hand.some(c => c.id === 'c1')).toBe(true);
    expect(afterSwap.players[2]!.hand.some(c => c.id === 'a1')).toBe(true);
  });

  it('treats players swapped down to one card as already called UNO', () => {
    const seven = makeCard('number', 'red', { value: 7, id: 'seven_uno_swap' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [seven, makeCard('number', 'blue', { value: 1, id: 'alice_left' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 2, id: 'bob_a' }), makeCard('number', 'yellow', { value: 3, id: 'bob_b' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 4, id: 'carol_only' })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, sevenSwapHands: true } },
    });

    const afterPlay = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'seven_uno_swap' });
    const afterSwap = applyActionWithHouseRules(afterPlay, { type: 'CHOOSE_SWAP_TARGET', playerId: 'p1', targetId: 'p3' });
    expect(afterSwap.players[0]!.hand).toHaveLength(1);
    expect(afterSwap.players[0]!.calledUno).toBe(true);

    const caught = applyActionWithHouseRules(afterSwap, { type: 'CATCH_UNO', catcherId: 'p2', targetId: 'p1' });
    expect(caught).toBe(afterSwap);
  });

  it('does not swap when rule is disabled', () => {
    const seven = makeCard('number', 'red', { value: 7, id: 'seven2' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [seven, makeCard('number', 'red', { value: 1, id: 'a2' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 2, id: 'b3' })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'yellow', { value: 4 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, sevenSwapHands: false } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'seven2' });
    expect(next.players[1]!.hand.some(c => c.id === 'b3')).toBe(true);
    expect(next.players[0]!.hand.some(c => c.id === 'a2')).toBe(true);
    expect(next.players[0]!.hand.some(c => c.id === 'b3')).toBe(false);
  });
});

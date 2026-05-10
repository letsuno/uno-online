import { describe, it, expect } from 'vitest';
import { applyActionWithHouseRules } from '../src/rules/house-rules-engine';
import { initializeGame, initializeNextRound } from '../src/rules/setup';
import type { GameState } from '../src/types/game';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules';
import { makeCard, makeState, drawPendingPenalty as _drawPendingPenalty } from './helpers/test-utils';

function drawPendingPenalty(state: GameState): GameState {
  return _drawPendingPenalty(state, applyActionWithHouseRules);
}

describe('multiplePlaySameNumber', () => {
  it('keeps turn on same player after playing a number card when they have more of same number', () => {
    const red5 = makeCard('number', 'red', { value: 5, id: 'red5' });
    const blue5 = makeCard('number', 'blue', { value: 5, id: 'blue5' });
    const green3 = makeCard('number', 'green', { value: 3, id: 'green3' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [red5, blue5, green3], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, multiplePlaySameNumber: true } },
    });

    const result = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'red5' });
    expect(result.currentPlayerIndex).toBe(0);
  });

  it('advances turn normally when player has no more same-number cards', () => {
    const red5 = makeCard('number', 'red', { value: 5, id: 'red5' });
    const green3 = makeCard('number', 'green', { value: 3, id: 'green3' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [red5, green3], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, multiplePlaySameNumber: true } },
    });

    const result = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'red5' });
    expect(result.currentPlayerIndex).toBe(1);
  });

  it('allows PASS after PLAY_CARD to end multi-play turn', () => {
    const blue5 = makeCard('number', 'blue', { value: 5, id: 'blue5' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [blue5], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      discardPile: [makeCard('number', 'red', { value: 5, id: 'discard_top' })],
      lastAction: { type: 'PLAY_CARD', playerId: 'p1', cardId: 'prev_card' },
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, multiplePlaySameNumber: true } },
    });

    const result = applyActionWithHouseRules(state, { type: 'PASS', playerId: 'p1' });
    expect(result.currentPlayerIndex).toBe(1);
  });
});

describe('bombCard', () => {
  it('makes all other players draw 1 when 3+ same-number cards are on top of discard', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'green', { value: 7, id: 'g7' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'blue', { value: 2 })], score: 0, connected: true, calledUno: false },
      ],
      discardPile: [
        makeCard('number', 'red', { value: 7, id: 'd1' }),
        makeCard('number', 'blue', { value: 7, id: 'd2' }),
        makeCard('number', 'yellow', { value: 7, id: 'd3' }),
      ],
      currentColor: 'yellow',
      lastAction: { type: 'PLAY_CARD', playerId: 'p1', cardId: 'prev' },
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, bombCard: true } },
    });

    const result = applyActionWithHouseRules(state, { type: 'PASS', playerId: 'p1' });
    expect(result.pendingPenaltyDraws).toBe(1);
    expect(result.pendingPenaltyQueue).toHaveLength(1);
    const paid = drawPendingPenalty(result);
    expect(paid.currentPlayerIndex).toBe(1);
    const bob = paid.players.find(p => p.id === 'p2')!;
    const carol = paid.players.find(p => p.id === 'p3')!;
    expect(bob.hand.length).toBe(2);
    expect(carol.hand.length).toBe(2);
  });

  it('does not trigger bomb for fewer than 3 same-number cards', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'green', { value: 7, id: 'g7' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      discardPile: [
        makeCard('number', 'red', { value: 7, id: 'd1' }),
        makeCard('number', 'blue', { value: 7, id: 'd2' }),
      ],
      currentColor: 'blue',
      lastAction: { type: 'PLAY_CARD', playerId: 'p1', cardId: 'prev' },
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, bombCard: true } },
    });

    const result = applyActionWithHouseRules(state, { type: 'PASS', playerId: 'p1' });
    const bob = result.players.find(p => p.id === 'p2')!;
    expect(bob.hand.length).toBe(1);
  });
});

describe('elimination', () => {
  it('eliminates player with most cards at round end', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'red', { value: 5, id: 'last' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: Array.from({ length: 5 }, (_, i) => makeCard('number', 'blue', { value: i, id: `b${i}` })), score: 0, connected: true, calledUno: false },
        { id: 'p3', name: 'Carol', hand: Array.from({ length: 3 }, (_, i) => makeCard('number', 'green', { value: i, id: `c${i}` })), score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, elimination: true } },
    });

    const result = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'last' });
    expect(result.phase).toBe('round_end');
    const bob = result.players.find(p => p.id === 'p2')!;
    expect(bob.eliminated).toBe(true);
    const carol = result.players.find(p => p.id === 'p3')!;
    expect(carol.eliminated).not.toBe(true);
  });

  it('ends game when only 1 non-eliminated player remains', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'red', { value: 5, id: 'last' })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: Array.from({ length: 3 }, (_, i) => makeCard('number', 'blue', { value: i, id: `b${i}` })), score: 0, connected: true, calledUno: false, eliminated: true },
        { id: 'p3', name: 'Carol', hand: Array.from({ length: 5 }, (_, i) => makeCard('number', 'green', { value: i, id: `c${i}` })), score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, elimination: true } },
    });

    const result = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'last' });
    expect(result.phase).toBe('game_over');
  });
});

describe('teamMode', () => {
  it('assigns alternating teams with even player count', () => {
    const state = initializeGame(
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }, { id: 'p4', name: 'D' }],
      { ...DEFAULT_HOUSE_RULES, teamMode: true },
    );
    expect(state.players[0]!.teamId).toBe(0);
    expect(state.players[1]!.teamId).toBe(1);
    expect(state.players[2]!.teamId).toBe(0);
    expect(state.players[3]!.teamId).toBe(1);
  });

  it('does not assign teams with odd player count', () => {
    const state = initializeGame(
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }],
      { ...DEFAULT_HOUSE_RULES, teamMode: true },
    );
    expect(state.players[0]!.teamId).toBeUndefined();
  });

  it('does not assign teams when teamMode is false', () => {
    const state = initializeGame(
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }, { id: 'p4', name: 'D' }],
      { ...DEFAULT_HOUSE_RULES, teamMode: false },
    );
    expect(state.players[0]!.teamId).toBeUndefined();
  });
});

describe('initializeNextRound', () => {
  it('preserves scores and increments round number', () => {
    const state = initializeGame(
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
    );
    state.players[0]!.score = 50;
    state.players[1]!.score = 30;
    state.phase = 'round_end';

    const next = initializeNextRound(state);
    expect(next.roundNumber).toBe(2);
    expect(next.phase).toBe('playing');
    expect(next.players[0]!.score).toBe(50);
    expect(next.players[1]!.score).toBe(30);
    expect(next.winnerId).toBeNull();
    expect(next.players[0]!.hand.length).toBeGreaterThanOrEqual(7);
    expect(next.players[1]!.hand.length).toBeGreaterThanOrEqual(7);
  });

  it('skips eliminated players when dealing', () => {
    const state = initializeGame(
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }],
    );
    state.players[1]!.eliminated = true;
    state.phase = 'round_end';

    const next = initializeNextRound(state);
    expect(next.players[0]!.hand.length).toBeGreaterThanOrEqual(7);
    expect(next.players[1]!.hand.length).toBe(0);
    expect(next.players[2]!.hand.length).toBeGreaterThanOrEqual(7);
  });
});

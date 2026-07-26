import { describe, it, expect } from 'vitest';
import { getNextPlayerIndex, getNextAliveIndex, countAlivePlayers, rotateHands } from '../src/rules/turn';
import { applyActionWithHouseRules } from '../src/rules/house-rules-engine';
import { initializeGame, initializeNextRound } from '../src/rules/setup';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules';
import { makeState, makeCard } from './helpers/test-utils';
import type { Card } from '../src/types/card';
import type { GameState, Player } from '../src/types/game';

const seat = (eliminated: boolean) => ({ eliminated });

describe('getNextAliveIndex', () => {
  const alive = [seat(false), seat(false), seat(false), seat(false)];

  it('matches getNextPlayerIndex when nobody is eliminated', () => {
    for (let from = 0; from < 4; from++) {
      for (const dir of ['clockwise', 'counter_clockwise'] as const) {
        for (const skip of [0, 1]) {
          expect(getNextAliveIndex(alive, from, dir, skip))
            .toBe(getNextPlayerIndex(from, 4, dir, skip));
        }
      }
    }
  });

  it('skips eliminated seats', () => {
    const players = [seat(false), seat(true), seat(false), seat(false)];
    expect(getNextAliveIndex(players, 0, 'clockwise')).toBe(2);
    expect(getNextAliveIndex(players, 2, 'counter_clockwise')).toBe(0);
  });

  it('skip=1 skips over an alive player, not an eliminated seat', () => {
    const players = [seat(false), seat(true), seat(false), seat(false)];
    // From 0: next alive is 2, skipping them lands on 3
    expect(getNextAliveIndex(players, 0, 'clockwise', 1)).toBe(3);
  });

  it('wraps around eliminated seats at the boundary', () => {
    const players = [seat(true), seat(false), seat(false), seat(true)];
    expect(getNextAliveIndex(players, 2, 'clockwise')).toBe(1);
  });

  it('countAlivePlayers counts non-eliminated seats', () => {
    expect(countAlivePlayers([seat(false), seat(true), seat(false)])).toBe(2);
  });
});

describe('rotateHands', () => {
  it('passes hands only between alive players', () => {
    const players = [
      { eliminated: false, hand: ['a'] },
      { eliminated: true, hand: [] },
      { eliminated: false, hand: ['c'] },
      { eliminated: false, hand: ['d'] },
    ];
    const rotated = rotateHands(players, 'clockwise');
    // clockwise: each alive player receives from the previous alive seat
    expect(rotated[0]!.hand).toEqual(['d']);
    expect(rotated[1]!.hand).toEqual([]); // eliminated seat keeps empty hand
    expect(rotated[2]!.hand).toEqual(['a']);
    expect(rotated[3]!.hand).toEqual(['c']);
  });
});

// ─── Engine integration: eliminated seats never act ───────────────────────────

function elimPlayers(hands: (Card[] | null)[]): Player[] {
  return hands.map((hand, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    hand: hand ?? [],
    score: 0,
    connected: true,
    autopilot: false,
    calledUno: false,
    eliminated: hand === null,
  }));
}

const n = (id: string, color: 'red' | 'blue' | 'green' | 'yellow', value: number): Card =>
  ({ id, type: 'number', color, value });

function elimState(overrides: Partial<GameState>): GameState {
  return makeState({
    settings: {
      turnTimeLimit: 30,
      targetScore: 500,
      allowSpectators: true,
      spectatorMode: 'hidden',
      houseRules: { ...DEFAULT_HOUSE_RULES, elimination: true },
    },
    ...overrides,
  });
}

describe('engine skips eliminated seats', () => {
  it('number card passes the turn over an eliminated seat', () => {
    const state = elimState({
      players: elimPlayers([[n('a1', 'red', 3), n('a2', 'blue', 1)], null, [n('c1', 'green', 2)]]),
      discardPile: [n('top', 'red', 7)],
      currentColor: 'red',
      currentPlayerIndex: 0,
    });
    const after = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'a1' });
    expect(after.currentPlayerIndex).toBe(2);
  });

  it('skip card skips an alive player, not an eliminated seat', () => {
    const skipCard = makeCard('skip', 'red', { id: 'sk1' });
    const state = elimState({
      players: elimPlayers([[skipCard, n('a2', 'blue', 1)], null, [n('c1', 'green', 2)], [n('d1', 'yellow', 4)]]),
      discardPile: [n('top', 'red', 7)],
      currentColor: 'red',
      currentPlayerIndex: 0,
    });
    const after = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'sk1' });
    // p2 eliminated; skip passes over alive p3, lands on p4
    expect(after.currentPlayerIndex).toBe(3);
  });

  it('draw_two penalizes the next ALIVE player', () => {
    const d2 = makeCard('draw_two', 'red', { id: 'd2' });
    const state = elimState({
      players: elimPlayers([[d2, n('a2', 'blue', 1)], null, [n('c1', 'green', 2)], [n('d1', 'yellow', 4)]]),
      discardPile: [n('top', 'red', 7)],
      currentColor: 'red',
      currentPlayerIndex: 0,
    });
    const after = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd2' });
    // Victim must be p3 (p2 is eliminated) — it becomes the current player with pending draws
    expect(after.currentPlayerIndex).toBe(2);
    expect(after.pendingPenaltyDraws).toBe(2);
  });

  it('eliminated player cannot draw a card', () => {
    const state = elimState({
      players: elimPlayers([[n('a1', 'red', 3)], null, [n('c1', 'green', 2)]]),
      discardPile: [n('top', 'red', 7)],
      currentColor: 'red',
      currentPlayerIndex: 0,
    });
    // Even if a stale client sends an action for the eliminated player, it's not their turn
    const after = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' });
    expect(after.players[1]!.hand.length).toBe(0);
  });

  it('next round never starts on an eliminated seat', () => {
    const state = initializeGame(
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }],
      { ...DEFAULT_HOUSE_RULES, elimination: true },
    );
    state.players[1]!.eliminated = true;
    state.phase = 'round_end';
    state.currentPlayerIndex = 1; // round ended while pointing at the now-eliminated seat

    const next = initializeNextRound(state);
    expect(next.players[next.currentPlayerIndex]!.eliminated).not.toBe(true);
  });

  it('full flow: elimination at round end, then round 2 turns skip the zombie seat', () => {
    let state = initializeGame(
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }],
      { ...DEFAULT_HOUSE_RULES, elimination: true },
    );
    state.players[0]!.hand = [n('a1', 'red', 5)];
    state.players[0]!.calledUno = true;
    state.players[1]!.hand = [n('b1', 'blue', 1), n('b2', 'blue', 2), n('b3', 'blue', 3)];
    state.players[2]!.hand = [n('c1', 'green', 1)];
    state.discardPile = [n('top', 'red', 7)];
    state.currentColor = 'red';
    state.currentPlayerIndex = 0;
    state.phase = 'playing';

    state = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'a1' });
    expect(state.phase).toBe('round_end');
    expect(state.players[1]!.eliminated).toBe(true);

    let round2 = initializeNextRound(state);
    round2 = {
      ...round2,
      phase: 'playing',
      currentPlayerIndex: 0,
      direction: 'clockwise',
      discardPile: [n('t2', 'red', 7)],
      currentColor: 'red',
      drawStack: 0,
      pendingPenaltyDraws: 0,
    };
    round2.players[0]!.hand = [n('a2', 'red', 3), n('a3', 'blue', 4)];

    const after = applyActionWithHouseRules(round2, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'a2' });
    expect(after.players[after.currentPlayerIndex]!.id).toBe('p3');
  });

  it('zero-rotate keeps eliminated hands empty', () => {
    const zero = n('z0', 'red', 0);
    const state = elimState({
      players: elimPlayers([[zero, n('a2', 'blue', 1)], null, [n('c1', 'green', 2), n('c2', 'green', 3)]]),
      discardPile: [n('top', 'red', 7)],
      currentColor: 'red',
      currentPlayerIndex: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, elimination: true, zeroRotateHands: true },
      },
    });
    const after = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'z0' });
    expect(after.players[1]!.hand.length).toBe(0);
    // p1's remaining hand (1 card) went to p3; p3's 2 cards went to p1
    expect(after.players[0]!.hand.length).toBe(2);
    expect(after.players[2]!.hand.length).toBe(1);
  });

  it('seven-swap rejects an eliminated target', () => {
    const state = elimState({
      phase: 'choosing_swap_target',
      players: elimPlayers([[n('a1', 'red', 1)], null, [n('c1', 'green', 2)]]),
      currentPlayerIndex: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, elimination: true, sevenSwapHands: true },
      },
    });
    const after = applyActionWithHouseRules(state, { type: 'CHOOSE_SWAP_TARGET', playerId: 'p1', targetId: 'p2' });
    // Swap must be rejected: state unchanged apart from being handled
    expect(after.phase).toBe('choosing_swap_target');
    expect(after.players[0]!.hand.length).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { calculateRoundScore, calculateRoundScores } from '../src/rules/scoring.js';
import type { Card } from '../src/types/card.js';
import type { Player } from '../src/types/game.js';

function makePlayer(id: string, hand: Card[]): Player {
  return { id, name: id, hand, score: 0, connected: true, calledUno: false };
}

describe('calculateRoundScore', () => {
  it('scores number cards at face value', () => {
    const hand: Card[] = [
      { id: '1', type: 'number', color: 'red', value: 7 },
      { id: '2', type: 'number', color: 'blue', value: 3 },
    ];
    expect(calculateRoundScore(hand)).toBe(10);
  });

  it('scores skip/reverse/draw_two at 20 each', () => {
    const hand: Card[] = [
      { id: '1', type: 'skip', color: 'red' },
      { id: '2', type: 'reverse', color: 'blue' },
      { id: '3', type: 'draw_two', color: 'green' },
    ];
    expect(calculateRoundScore(hand)).toBe(60);
  });

  it('scores wild cards at 50 each', () => {
    const hand: Card[] = [
      { id: '1', type: 'wild', color: null },
      { id: '2', type: 'wild_draw_four', color: null },
    ];
    expect(calculateRoundScore(hand)).toBe(100);
  });

  it('scores empty hand as 0', () => {
    expect(calculateRoundScore([])).toBe(0);
  });
});

describe('calculateRoundScores', () => {
  it('sums all losers hands as the winner score', () => {
    const players: Player[] = [
      makePlayer('winner', []),
      makePlayer('p2', [{ id: '1', type: 'number', color: 'red', value: 5 }]),
      makePlayer('p3', [{ id: '2', type: 'wild', color: null }]),
    ];
    const scores = calculateRoundScores(players, 'winner');
    expect(scores['winner']).toBe(55);
    expect(scores['p2']).toBe(0);
    expect(scores['p3']).toBe(0);
  });
});

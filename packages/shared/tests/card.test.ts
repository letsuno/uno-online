import { describe, expect, it } from 'vitest';
import { sortHand } from '../src/types/card.js';
import type { Card } from '../src/types/card.js';

describe('sortHand', () => {
  it('orders every current card color and type without mutating the hand', () => {
    const hand: Card[] = [
      { id: 'wild', type: 'wild', color: null },
      { id: 'blue-reverse', type: 'reverse', color: 'blue' },
      { id: 'red-skip', type: 'skip', color: 'red' },
      { id: 'red-number', type: 'number', color: 'red', value: 7 },
      { id: 'yellow-draw', type: 'draw_two', color: 'yellow' },
    ];

    expect(sortHand(hand).map(card => card.id)).toEqual([
      'red-number',
      'red-skip',
      'yellow-draw',
      'blue-reverse',
      'wild',
    ]);
    expect(hand.map(card => card.id)).toEqual(['wild', 'blue-reverse', 'red-skip', 'red-number', 'yellow-draw']);
  });
});

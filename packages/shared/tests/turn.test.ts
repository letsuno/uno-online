import { describe, it, expect } from 'vitest';
import { getNextPlayerIndex, reverseDirection } from '../src/rules/turn';

describe('getNextPlayerIndex', () => {
  it('goes clockwise: 0 -> 1 -> 2 -> 0', () => {
    expect(getNextPlayerIndex(0, 3, 'clockwise')).toBe(1);
    expect(getNextPlayerIndex(1, 3, 'clockwise')).toBe(2);
    expect(getNextPlayerIndex(2, 3, 'clockwise')).toBe(0);
  });

  it('goes counter-clockwise: 0 -> 2 -> 1 -> 0', () => {
    expect(getNextPlayerIndex(0, 3, 'counter_clockwise')).toBe(2);
    expect(getNextPlayerIndex(1, 3, 'counter_clockwise')).toBe(0);
    expect(getNextPlayerIndex(2, 3, 'counter_clockwise')).toBe(1);
  });

  it('handles 2 players: 0 -> 1 -> 0', () => {
    expect(getNextPlayerIndex(0, 2, 'clockwise')).toBe(1);
    expect(getNextPlayerIndex(1, 2, 'clockwise')).toBe(0);
  });

  it('skips with skip=1: 0 -> 2 (skipping 1)', () => {
    expect(getNextPlayerIndex(0, 4, 'clockwise', 1)).toBe(2);
  });

  it('skips wraps around', () => {
    expect(getNextPlayerIndex(3, 4, 'clockwise', 1)).toBe(1);
  });
});

describe('reverseDirection', () => {
  it('reverses clockwise to counter_clockwise', () => {
    expect(reverseDirection('clockwise')).toBe('counter_clockwise');
  });

  it('reverses counter_clockwise to clockwise', () => {
    expect(reverseDirection('counter_clockwise')).toBe('clockwise');
  });
});

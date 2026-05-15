import { describe, it, expect } from 'vitest';
import { calculateBotDelay } from '../../src/ws/bot-manager';

describe('calculateBotDelay', () => {
  it('returns delay within novice range', () => {
    const delay = calculateBotDelay('novice', 3);
    expect(delay).toBeGreaterThanOrEqual(2000);
    expect(delay).toBeLessThanOrEqual(5000);
  });

  it('hard difficulty has shorter delays', () => {
    const delays = Array.from({ length: 20 }, () => calculateBotDelay('hard', 3));
    const avg = delays.reduce((a, b) => a + b, 0) / delays.length;
    expect(avg).toBeLessThan(3000);
  });

  it('more playable cards increases delay', () => {
    // maxDelay for normal caps the result
    const high = calculateBotDelay('normal', 10);
    expect(high).toBeLessThanOrEqual(4000);
  });

  it('respects maxDelay cap', () => {
    const delay = calculateBotDelay('novice', 100);
    expect(delay).toBeLessThanOrEqual(5000);
  });
});

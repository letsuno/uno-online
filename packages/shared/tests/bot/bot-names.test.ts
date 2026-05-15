import { describe, it, expect } from 'vitest';
import { BOT_NAMES, pickBotName } from '../../src/rules/bot/bot-names';

describe('BOT_NAMES', () => {
  it('has 26 names (A-Z)', () => {
    expect(BOT_NAMES).toHaveLength(26);
  });

  it('each name starts with a unique letter', () => {
    const firstLetters = BOT_NAMES.map(n => n[0]!.toUpperCase());
    expect(new Set(firstLetters).size).toBe(26);
  });
});

describe('pickBotName', () => {
  it('returns a name not in the used set', () => {
    const used = new Set(['Alice', 'Bob']);
    const name = pickBotName(used);
    expect(used.has(name)).toBe(false);
    expect(BOT_NAMES).toContain(name);
  });

  it('returns any name when all are available', () => {
    const name = pickBotName(new Set());
    expect(BOT_NAMES).toContain(name);
  });

  it('falls back to Bot #N when all names taken', () => {
    const allUsed = new Set(BOT_NAMES);
    const name = pickBotName(allUsed);
    expect(name).toMatch(/^Bot #\d+$/);
  });
});

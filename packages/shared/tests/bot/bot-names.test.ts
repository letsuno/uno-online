import { describe, it, expect } from 'vitest';
import { BOT_NAMES, pickBotName } from '../../src/rules/bot/bot-names';

describe('BOT_NAMES', () => {
  it('covers all 26 letters (A-Z)', () => {
    const firstLetters = new Set(BOT_NAMES.map(n => n[0]!.toUpperCase()));
    expect(firstLetters.size).toBe(26);
  });

  it('has equal number of names per letter', () => {
    const groups = new Map<string, number>();
    for (const name of BOT_NAMES) {
      const letter = name[0]!.toUpperCase();
      groups.set(letter, (groups.get(letter) ?? 0) + 1);
    }
    const counts = [...groups.values()];
    expect(new Set(counts).size).toBe(1);
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

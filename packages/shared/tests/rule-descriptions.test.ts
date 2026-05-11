import { describe, it, expect } from 'vitest';
import { HOUSE_RULE_DESCRIPTIONS } from '../src/rules/rule-descriptions';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules';

describe('HOUSE_RULE_DESCRIPTIONS', () => {
  it('covers every key in HouseRules', () => {
    for (const key of Object.keys(DEFAULT_HOUSE_RULES)) {
      expect(HOUSE_RULE_DESCRIPTIONS).toHaveProperty(key);
      expect(typeof HOUSE_RULE_DESCRIPTIONS[key as keyof typeof HOUSE_RULE_DESCRIPTIONS]).toBe('string');
      expect(HOUSE_RULE_DESCRIPTIONS[key as keyof typeof HOUSE_RULE_DESCRIPTIONS].length).toBeGreaterThan(0);
    }
  });

  it('has no extra keys not in HouseRules', () => {
    const houseRuleKeys = new Set(Object.keys(DEFAULT_HOUSE_RULES));
    for (const key of Object.keys(HOUSE_RULE_DESCRIPTIONS)) {
      expect(houseRuleKeys.has(key)).toBe(true);
    }
  });
});

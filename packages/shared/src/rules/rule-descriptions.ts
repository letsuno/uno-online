import type { HouseRules } from '../types/house-rules.js';
import { FLIP_HOUSE_RULE_DEFINITIONS, HOUSE_RULE_DEFINITIONS } from '../constants/house-rules.js';

export const HOUSE_RULE_DESCRIPTIONS: Record<keyof HouseRules, string> = Object.fromEntries(
  [...HOUSE_RULE_DEFINITIONS, ...FLIP_HOUSE_RULE_DEFINITIONS].map((d) => [d.key, d.description]),
) as Record<keyof HouseRules, string>;

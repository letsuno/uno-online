import type { HouseRules } from '../types/house-rules';
import { HOUSE_RULE_DEFINITIONS } from '../constants/house-rules';

export const HOUSE_RULE_DESCRIPTIONS: Record<keyof HouseRules, string> = Object.fromEntries(
  HOUSE_RULE_DEFINITIONS.map((d) => [d.key, d.description]),
) as Record<keyof HouseRules, string>;

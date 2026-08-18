import { DEFAULT_HOUSE_RULES } from '../types/house-rules.js';
import type { HouseRules } from '../types/house-rules.js';
import type { RoomSettings, RoomSettingsPatch } from '../types/game.js';

const ROOM_SETTING_KEYS = new Set(['turnTimeLimit', 'targetScore', 'houseRules', 'allowSpectators', 'spectatorMode']);
const HOUSE_RULE_KEYS = new Set(Object.keys(DEFAULT_HOUSE_RULES));
const TURN_TIME_LIMITS = new Set([15, 30, 60]);
const TARGET_SCORES = new Set([200, 300, 500, 1000]);
const HAND_LIMITS = new Set<unknown>([null, 15, 20, 25]);
const HAND_REVEAL_THRESHOLDS = new Set<unknown>([null, 2, 3]);
const UNO_PENALTY_COUNTS = new Set<unknown>([2, 4, 6]);
const BLITZ_TIME_LIMITS = new Set<unknown>([null, 120, 300, 600]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCurrentHouseRuleValue(key: string, value: unknown): boolean {
  switch (key) {
    case 'handLimit':
      return HAND_LIMITS.has(value);
    case 'handRevealThreshold':
      return HAND_REVEAL_THRESHOLDS.has(value);
    case 'unoPenaltyCount':
      return UNO_PENALTY_COUNTS.has(value);
    case 'blitzTimeLimit':
      return BLITZ_TIME_LIMITS.has(value);
    default:
      return typeof value === 'boolean';
  }
}

export function isCurrentHouseRulesPatch(value: unknown): value is Partial<HouseRules> {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([key, ruleValue]) => HOUSE_RULE_KEYS.has(key) && isCurrentHouseRuleValue(key, ruleValue),
  );
}

export function isCurrentHouseRules(value: unknown): value is HouseRules {
  if (!isCurrentHouseRulesPatch(value)) return false;
  return (
    HOUSE_RULE_KEYS.size === Object.keys(value).length && [...HOUSE_RULE_KEYS].every(key => Object.hasOwn(value, key))
  );
}

export function isCurrentRoomSettingsPatch(value: unknown): value is RoomSettingsPatch {
  if (!isRecord(value) || Object.keys(value).some(key => !ROOM_SETTING_KEYS.has(key))) {
    return false;
  }
  return (
    (!Object.hasOwn(value, 'turnTimeLimit') ||
      (typeof value['turnTimeLimit'] === 'number' && TURN_TIME_LIMITS.has(value['turnTimeLimit']))) &&
    (!Object.hasOwn(value, 'targetScore') ||
      (typeof value['targetScore'] === 'number' && TARGET_SCORES.has(value['targetScore']))) &&
    (!Object.hasOwn(value, 'allowSpectators') || typeof value['allowSpectators'] === 'boolean') &&
    (!Object.hasOwn(value, 'spectatorMode') ||
      value['spectatorMode'] === 'full' ||
      value['spectatorMode'] === 'hidden') &&
    (!Object.hasOwn(value, 'houseRules') || isCurrentHouseRulesPatch(value['houseRules']))
  );
}

export function isCurrentRoomSettings(value: unknown): value is RoomSettings {
  if (!isCurrentRoomSettingsPatch(value) || !isRecord(value)) return false;
  return (
    ROOM_SETTING_KEYS.size === Object.keys(value).length &&
    [...ROOM_SETTING_KEYS].every(key => Object.hasOwn(value, key)) &&
    isCurrentHouseRules(value['houseRules'])
  );
}

export function applyRoomSettingsPatch(current: RoomSettings, patch: RoomSettingsPatch): RoomSettings {
  return {
    ...current,
    ...patch,
    houseRules: {
      ...current.houseRules,
      ...patch.houseRules,
    },
  };
}

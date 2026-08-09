import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOUSE_RULES,
  applyRoomSettingsPatch,
  isCurrentRoomSettings,
  isCurrentRoomSettingsPatch,
} from '../src/index.js';

const settings = {
  turnTimeLimit: 30 as const,
  targetScore: 500 as const,
  houseRules: DEFAULT_HOUSE_RULES,
  allowSpectators: true,
  spectatorMode: 'hidden' as const,
};

describe('current room settings validation', () => {
  it('accepts current full settings and nested partial patches', () => {
    expect(isCurrentRoomSettings(settings)).toBe(true);
    expect(
      isCurrentRoomSettingsPatch({
        spectatorMode: 'full',
        houseRules: { handLimit: 15, blitzTimeLimit: 300 },
      }),
    ).toBe(true);
    expect(
      applyRoomSettingsPatch(settings, {
        houseRules: { handLimit: 15 },
      }).houseRules.handLimit,
    ).toBe(15);
  });

  it.each([
    { houseRules: { handLimit: 16 } },
    { houseRules: { handRevealThreshold: 4 } },
    { houseRules: { unoPenaltyCount: 3 } },
    { houseRules: { blitzTimeLimit: 60 } },
    { unknownSetting: true },
    { houseRules: { removedRule: true } },
  ])('rejects an out-of-protocol patch: %o', patch => {
    expect(isCurrentRoomSettingsPatch(patch)).toBe(false);
  });
});

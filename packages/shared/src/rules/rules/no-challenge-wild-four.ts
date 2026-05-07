import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { PreCheckResult } from '../house-rule-types';

export const noChallengeWildFour: HouseRulePlugin = {
  meta: {
    id: 'no-challenge-wild-four',
    keys: ['noChallengeWildFour'],
    label: '无质疑 +4',
    description: '关闭 +4 质疑机制',
  },
  isEnabled: (hr) => hr.noChallengeWildFour,
  preCheck: (state: GameState, action: GameAction): PreCheckResult => {
    if (action.type !== 'CHALLENGE') return { handled: false };
    return { handled: true, state };
  },
};

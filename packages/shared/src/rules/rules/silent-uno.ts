import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { PreCheckResult } from '../house-rule-types';

export const silentUno: HouseRulePlugin = {
  meta: {
    id: 'silent-uno',
    keys: ['silentUno'],
    label: '静默 UNO',
    description: '取消 UNO 喊话机制',
  },
  isEnabled: (hr) => hr.silentUno,
  preCheck: (state: GameState, action: GameAction): PreCheckResult => {
    if (action.type !== 'CATCH_UNO') return { handled: false };
    return { handled: true, state };
  },
};

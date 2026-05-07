import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext, PreCheckResult } from '../house-rule-types';

export const drawUntilPlayable: HouseRulePlugin = {
  meta: {
    id: 'draw-until-playable',
    keys: ['drawUntilPlayable'],
    label: '摸到能出为止',
    description: '无牌可出时一直摸到能出的牌',
  },
  isEnabled: (hr) => hr.drawUntilPlayable,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (action.type !== 'DRAW_CARD') return { handled: false };
    return { handled: true, state: ctx.handleDrawUntilPlayable(state, action) };
  },
};

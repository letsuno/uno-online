import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext } from '../house-rule-types';

export const forcedPlayAfterDraw: HouseRulePlugin = {
  meta: {
    id: 'forced-play-after-draw',
    keys: ['forcedPlayAfterDraw'],
    label: '摸牌后必须出',
    description: '摸到可出的牌时强制打出',
  },
  isEnabled: (hr) => hr.forcedPlayAfterDraw,
  postProcess: (_before: GameState, after: GameState, action: GameAction, ctx: RuleContext): GameState => {
    if (action.type !== 'DRAW_CARD') return after;
    if ((after.pendingPenaltyDraws ?? 0) > 0 || (_before.pendingPenaltyDraws ?? 0) > 0) return after;
    return ctx.handleForcedPlayAfterDraw(after, action);
  },
};

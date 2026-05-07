import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext, PreCheckResult } from '../house-rule-types';

export const finishRestrictions: HouseRulePlugin = {
  meta: {
    id: 'finish-restrictions',
    keys: ['noWildFinish', 'noFunctionCardFinish'],
    label: '末牌限制 / 空手赢不算',
    description: '最后一张不能是万能牌 / 最后一张不能是 +2/+4',
  },
  isEnabled: (hr) => hr.noWildFinish || hr.noFunctionCardFinish,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (action.type !== 'PLAY_CARD') return { handled: false };
    const player = state.players.find(p => p.id === action.playerId);
    const card = player?.hand.find(c => c.id === action.cardId);
    if (!card) return { handled: false };
    const hr = state.settings.houseRules;
    if (hr.noWildFinish && ctx.isLastCard(state, action.playerId, action.cardId) && ctx.isWildType(card)) {
      return { handled: true, state };
    }
    if (hr.noFunctionCardFinish && ctx.isLastCard(state, action.playerId, action.cardId) && ctx.isFunctionCard(card)) {
      return { handled: true, state };
    }
    return { handled: false };
  },
};

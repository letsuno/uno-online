import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext, PreCheckResult } from '../house-rule-types';

export const misplayPenalty: HouseRulePlugin = {
  meta: {
    id: 'misplay-penalty',
    keys: ['misplayPenalty', 'blindDraw'],
    label: '误操作惩罚 / 暗牌模式',
    description: '出非法牌罚摸 1 张',
  },
  isEnabled: (hr) => hr.misplayPenalty || hr.blindDraw,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (action.type !== 'PLAY_CARD') return { handled: false };
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (state.phase !== 'playing' || currentPlayer?.id !== action.playerId) {
      return { handled: true, state };
    }
    const standardResult = ctx.applyAction(state, action);
    if (standardResult === state) {
      return {
        handled: true,
        state: ctx.startPenaltyDraw(state, action.playerId, 1, state.currentPlayerIndex),
      };
    }
    return { handled: false };
  },
};

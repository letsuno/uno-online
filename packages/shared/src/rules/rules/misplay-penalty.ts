import type { HouseRulePlugin } from '../house-rule-types.js';
import type { GameState, GameAction } from '../../types/game.js';
import type { RuleContext, PreCheckResult } from '../house-rule-types.js';

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
    // Challenge-phase PLAY_CARD may be a legal stack or deflection handled by
    // later plugins. Misplay penalties only judge normal-turn plays; claiming
    // every other phase here makes valid combined-rule responses a no-op.
    if (state.phase !== 'playing') return { handled: false };
    if (currentPlayer?.id !== action.playerId) {
      if (state.settings.houseRules.jumpIn) return { handled: false };
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

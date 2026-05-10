import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext, PreCheckResult } from '../house-rule-types';

export const unoPenalty: HouseRulePlugin = {
  meta: {
    id: 'uno-penalty',
    keys: ['unoPenaltyCount'],
    label: 'UNO 罚摸数量',
    description: '不喊 UNO 被抓罚摸张数',
  },
  isEnabled: (hr) => hr.unoPenaltyCount !== 2,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (action.type !== 'CATCH_UNO') return { handled: false };
    const hr = state.settings.houseRules;
    const targetIdx = state.players.findIndex(p => p.id === action.targetId);
    if (targetIdx === -1) return { handled: true, state };
    const target = state.players[targetIdx]!;
    if (target.hand.length !== 1 || target.calledUno || target.unoCaught) return { handled: true, state };
    const players = state.players.map((p, i) =>
      i === targetIdx ? { ...p, unoCaught: true } : p,
    );
    return {
      handled: true,
      state: ctx.startPenaltyDraw({ ...state, players, lastAction: action }, action.targetId, hr.unoPenaltyCount, state.currentPlayerIndex),
    };
  },
};

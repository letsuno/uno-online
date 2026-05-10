import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { PreCheckResult } from '../house-rule-types';

export const handLimit: HouseRulePlugin = {
  meta: {
    id: 'hand-limit',
    keys: ['handLimit'],
    label: '手牌上限',
    description: '超过数量时不能摸牌',
  },
  isEnabled: (hr) => hr.handLimit !== null,
  preCheck: (state: GameState, action: GameAction): PreCheckResult => {
    if (action.type !== 'DRAW_CARD') return { handled: false };
    if ((state.pendingPenaltyDraws ?? 0) > 0 || state.drawStack > 0) return { handled: false };
    const hr = state.settings.houseRules;
    if (hr.handLimit === null) return { handled: false };
    const player = state.players[state.currentPlayerIndex];
    if (player && player.id === action.playerId && player.hand.length >= hr.handLimit) {
      return { handled: true, state };
    }
    return { handled: false };
  },
};

import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext, PreCheckResult } from '../house-rule-types';
import { hasPendingDrawObligation } from '../house-rule-helpers';

export const drawUntilPlayable: HouseRulePlugin = {
  meta: {
    id: 'draw-until-playable',
    keys: ['drawUntilPlayable'],
    label: '摸到能出为止',
    description: '无牌可出时一直摸到能出的牌',
  },
  isEnabled: (hr) => hr.drawUntilPlayable,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (action.type === 'DRAW_CARD') {
      if (hasPendingDrawObligation(state)) return { handled: false };
      return { handled: true, state: ctx.handleDrawUntilPlayable(state, action) };
    }
    if (action.type !== 'PASS') return { handled: false };
    if (state.phase !== 'playing') return { handled: false };
    const player = state.players[state.currentPlayerIndex];
    if (player?.id !== action.playerId) return { handled: false };
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (topCard && state.currentColor) {
      const playable = player.hand.filter(c => ctx.canPlayCard(c, topCard, state.currentColor!));
      if (playable.length === 0) return { handled: true, state };
    }
    return { handled: false };
  },
};

import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext, PreCheckResult } from '../house-rule-types';
import { hasPendingDrawObligation, hasPlayableCard } from '../house-rule-helpers';

export const deathDrawPass: HouseRulePlugin = {
  meta: {
    id: 'death-draw-pass',
    keys: ['deathDraw'],
    label: '死亡抽牌',
    description: '无牌可出时必须不停摸牌',
  },
  isEnabled: (hr) => hr.deathDraw,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (action.type !== 'PASS') return { handled: false };
    if (state.phase !== 'playing') return { handled: false };
    const player = state.players[state.currentPlayerIndex];
    if (player?.id !== action.playerId) return { handled: false };
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (topCard && state.currentColor && !hasPlayableCard(player.hand, topCard, state.currentColor, ctx.canPlayCard)) {
      return { handled: true, state };
    }
    return { handled: false };
  },
};

export const deathDrawDraw: HouseRulePlugin = {
  meta: {
    id: 'death-draw-draw',
    keys: ['deathDraw'],
    label: '死亡抽牌',
    description: '无牌可出时必须不停摸牌',
  },
  isEnabled: (hr) => hr.deathDraw && !hr.drawUntilPlayable,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (action.type !== 'DRAW_CARD') return { handled: false };
    if (hasPendingDrawObligation(state)) return { handled: false };
    if (state.phase !== 'playing') return { handled: false };
    const player = state.players[state.currentPlayerIndex];
    if (player?.id !== action.playerId) return { handled: false };
    return { handled: true, state: ctx.handleDrawUntilPlayable(state, action) };
  },
};

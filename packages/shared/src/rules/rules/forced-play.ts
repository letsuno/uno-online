import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext, PreCheckResult } from '../house-rule-types';
import { hasPendingDrawObligation, hasPlayableCard } from '../house-rule-helpers';

export const forcedPlay: HouseRulePlugin = {
  meta: {
    id: 'forced-play',
    keys: ['forcedPlay'],
    label: '强制出牌',
    description: '有能出的牌就必须出',
  },
  isEnabled: (hr) => hr.forcedPlay,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (action.type !== 'DRAW_CARD') return { handled: false };
    if (hasPendingDrawObligation(state)) return { handled: false };
    if (state.phase !== 'playing') return { handled: false };
    const player = state.players[state.currentPlayerIndex];
    if (player?.id !== action.playerId) return { handled: false };
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (hasPlayableCard(player.hand, topCard, state.currentColor, ctx.canPlayCard)) return { handled: true, state };
    return { handled: false };
  },
};

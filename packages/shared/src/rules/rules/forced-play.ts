import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext, PreCheckResult } from '../house-rule-types';

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
    if (state.phase !== 'playing') return { handled: false };
    const player = state.players[state.currentPlayerIndex];
    if (player?.id !== action.playerId) return { handled: false };
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (topCard && state.currentColor) {
      const playable = player.hand.filter(c => ctx.canPlayCard(c, topCard, state.currentColor!));
      if (playable.length > 0) return { handled: true, state };
    }
    return { handled: false };
  },
};

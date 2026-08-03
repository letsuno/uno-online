import type { HouseRulePlugin } from '../house-rule-types.js';
import type { GameState, GameAction } from '../../types/game.js';
import type { RuleContext, PreCheckResult } from '../house-rule-types.js';
import { hasPendingDrawObligation, hasPlayableCard } from '../house-rule-helpers.js';
import { hasCardsAvailable, isStuckAtHandLimit } from '../game-engine.js';

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
      if (state.phase !== 'playing') return { handled: false };
      const player = state.players[state.currentPlayerIndex];
      if (player?.id !== action.playerId) return { handled: false };
      // A one-card discard pile and two empty side decks cannot yield a card.
      // Reject the no-op draw so PASS can advance this otherwise deadlocked turn.
      if (!hasCardsAvailable(state)) return { handled: true, state };
      const topCard = state.discardPile[state.discardPile.length - 1];
      if (topCard && state.currentColor && hasPlayableCard(player.hand, topCard, state.currentColor, ctx.canPlayCard)) {
        return { handled: true, state };
      }
      return { handled: true, state: ctx.handleDrawUntilPlayable(state, action) };
    }
    if (action.type !== 'PASS') return { handled: false };
    if (state.phase !== 'playing') return { handled: false };
    const player = state.players[state.currentPlayerIndex];
    if (player?.id !== action.playerId) return { handled: false };
    if (!hasCardsAvailable(state)) return { handled: false };
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (topCard && state.currentColor && !hasPlayableCard(player.hand, topCard, state.currentColor, ctx.canPlayCard)) {
      // Normally "nothing playable" means keep drawing, so PASS is rejected —
      // but when the hand limit blocks drawing, defer to the base engine,
      // which allows PASS in exactly that stuck situation.
      if (isStuckAtHandLimit(state)) return { handled: false };
      return { handled: true, state };
    }
    return { handled: false };
  },
};

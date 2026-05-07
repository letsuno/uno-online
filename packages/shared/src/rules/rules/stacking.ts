import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext, PreCheckResult } from '../house-rule-types';

export const stacking: HouseRulePlugin = {
  meta: {
    id: 'stacking',
    keys: ['stackDrawTwo', 'stackDrawFour', 'crossStack'],
    label: '+2/+4 叠加',
    description: '被 +2/+4 时可叠加给下家',
  },
  isEnabled: (hr) => hr.stackDrawTwo || hr.stackDrawFour || hr.crossStack,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    const hr = state.settings.houseRules;

    // Case (a): PLAY_CARD when drawStack > 0 — try to stack
    if (action.type === 'PLAY_CARD' && state.drawStack > 0) {
      const player = state.players[state.currentPlayerIndex];
      if (!player || player.id !== action.playerId) return { handled: true, state };
      const card = player.hand.find(c => c.id === action.cardId);
      if (!card) return { handled: true, state };
      const topCard = state.discardPile[state.discardPile.length - 1];
      const canStack =
        (hr.stackDrawTwo && card.type === 'draw_two' && topCard?.type === 'draw_two') ||
        (hr.stackDrawFour && card.type === 'wild_draw_four' && topCard?.type === 'wild_draw_four') ||
        (hr.crossStack && ((card.type === 'draw_two' && topCard?.type === 'wild_draw_four') || (card.type === 'wild_draw_four' && topCard?.type === 'draw_two')));
      if (canStack) {
        return { handled: true, state: ctx.putAttackCardOnStack(state, action, card, ctx.getCardDrawPenalty(card)) };
      }
      return { handled: true, state };
    }

    // Case (b): PLAY_CARD when drawStack === 0 — start new stack
    if (action.type === 'PLAY_CARD' && state.drawStack === 0 && state.phase === 'playing') {
      const player = state.players[state.currentPlayerIndex];
      if (player?.id !== action.playerId) return { handled: false };
      const card = player.hand.find(c => c.id === action.cardId);
      const topCard = state.discardPile[state.discardPile.length - 1];
      if (
        card &&
        topCard &&
        state.currentColor &&
        ctx.canStartDrawStack(state, card) &&
        ctx.canPlayCard(card, topCard, state.currentColor)
      ) {
        return { handled: true, state: ctx.putAttackCardOnStack(state, action, card, ctx.getCardDrawPenalty(card)) };
      }
      return { handled: false };
    }

    // Case (c): DRAW_CARD when drawStack > 0 — resolve stack
    if (action.type === 'DRAW_CARD' && state.drawStack > 0) {
      const player = state.players[state.currentPlayerIndex];
      if (!player || player.id !== action.playerId) return { handled: true, state };
      let newState = ctx.drawCardsFromDeck(state, action.playerId, state.drawStack);
      const nextIdx = ctx.getNextPlayerIndex(newState.currentPlayerIndex, newState.players.length, newState.direction);
      newState = { ...newState, drawStack: 0, currentPlayerIndex: nextIdx, lastAction: action };
      if (state.lastAction?.type === 'PLAY_CARD') {
        return { handled: true, state: ctx.applyDoubleScore(state, ctx.checkRoundEnd(newState, state.lastAction.playerId)) };
      }
      return { handled: true, state: newState };
    }

    return { handled: false };
  },
};

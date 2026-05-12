import type { HouseRulePlugin } from '../house-rule-types.js';
import type { GameState, GameAction } from '../../types/game.js';
import type { RuleContext, PreCheckResult } from '../house-rule-types.js';
import { checkRoundEnd } from '../game-engine.js';

export const deflection: HouseRulePlugin = {
  meta: {
    id: 'deflection',
    keys: ['reverseDeflectDrawTwo', 'reverseDeflectDrawFour', 'skipDeflect'],
    label: 'Reverse/Skip 反弹',
    description: '被 +2/+4 时出 Reverse 反弹或 Skip 转移',
  },
  isEnabled: (hr) => hr.reverseDeflectDrawTwo || hr.reverseDeflectDrawFour || hr.skipDeflect,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (action.type !== 'PLAY_CARD' || state.drawStack <= 0) return { handled: false };
    const hr = state.settings.houseRules;
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== action.playerId) return { handled: false };
    const card = player.hand.find(c => c.id === action.cardId);
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (!card) return { handled: false };

    const canReverseDeflect =
      (hr.reverseDeflectDrawTwo && card.type === 'reverse' && topCard?.type === 'draw_two') ||
      (hr.reverseDeflectDrawFour && card.type === 'reverse' && topCard?.type === 'wild_draw_four');

    if (canReverseDeflect) {
      const newHand = player.hand.filter(c => c.id !== action.cardId);
      const newDirection = state.direction === 'clockwise' ? 'counter_clockwise' : 'clockwise';
      const players = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? { ...p, hand: newHand } : p,
      );
      const nextIdx = ctx.getNextPlayerIndex(state.currentPlayerIndex, players.length, newDirection);
      return {
        handled: true,
        state: checkRoundEnd({
          ...state,
          players,
          discardPile: [...state.discardPile, card],
          currentColor: card.color ?? state.currentColor,
          direction: newDirection,
          currentPlayerIndex: nextIdx,
          lastAction: action,
        }, action.playerId),
      };
    }

    if (hr.skipDeflect && card.type === 'skip') {
      const newHand = player.hand.filter(c => c.id !== action.cardId);
      const players = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? { ...p, hand: newHand } : p,
      );
      const nextIdx = ctx.getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction);
      return {
        handled: true,
        state: checkRoundEnd({
          ...state,
          players,
          discardPile: [...state.discardPile, card],
          currentColor: card.color ?? state.currentColor,
          currentPlayerIndex: nextIdx,
          lastAction: action,
        }, action.playerId),
      };
    }

    return { handled: false };
  },
};

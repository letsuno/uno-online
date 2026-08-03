import type { HouseRulePlugin } from '../house-rule-types.js';
import type { GameState, GameAction } from '../../types/game.js';
import type { RuleContext, PreCheckResult } from '../house-rule-types.js';

export const finishRestrictions: HouseRulePlugin = {
  meta: {
    id: 'finish-restrictions',
    keys: ['noWildFinish', 'noFunctionCardFinish'],
    label: '末牌限制 / 空手赢不算',
    description: '最后一张不能是万能牌 / 最后一张不能是 +2/+4',
  },
  isEnabled: (hr) => hr.noWildFinish || hr.noFunctionCardFinish,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (action.type !== 'PLAY_CARD') return { handled: false };
    const player = state.players.find(p => p.id === action.playerId);
    if (!player) return { handled: false };
    const card = player.hand.find(c => c.id === action.cardId);
    if (!card) return { handled: false };
    const hr = state.settings.houseRules;
    const isLast = ctx.isLastCard(state, action.playerId, action.cardId);
    if (isLast && (
      (hr.noWildFinish && ctx.isWildCard(card)) ||
      (hr.noFunctionCardFinish && ctx.isFunctionCard(card))
    )) {
      const isCurrentPlayer = state.players[state.currentPlayerIndex]?.id === action.playerId;
      if (!isCurrentPlayer || state.drawStack > 0) {
        return { handled: true, state };
      }
      const penalized = ctx.drawCardsFromDeck(state, action.playerId, 1);
      const penalizedPlayer = penalized.players.find(p => p.id === action.playerId);
      if ((penalizedPlayer?.hand.length ?? player.hand.length) === player.hand.length) {
        // The prohibited last card stays in hand. If no penalty card exists,
        // forfeit this turn instead of reporting a state-changing no-op that
        // can be selected forever by policy or timeout play.
        return {
          handled: true,
          state: ctx.applyAction(state, { type: 'PASS', playerId: action.playerId }),
        };
      }
      return {
        handled: true,
        state: penalized,
      };
    }
    return { handled: false };
  },
};

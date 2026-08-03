import type { HouseRulePlugin } from '../house-rule-types.js';
import type { GameState, GameAction } from '../../types/game.js';
import type { RuleContext } from '../house-rule-types.js';

export const revengeMode: HouseRulePlugin = {
  meta: {
    id: 'revenge-mode',
    keys: ['revengeMode'],
    label: '复仇模式',
    description: '反击+2/+4时伤害翻倍',
  },
  isEnabled: (hr) => hr.revengeMode,
  postProcess: (before: GameState, after: GameState, action: GameAction, ctx: RuleContext): GameState => {
    if (action.type !== 'PLAY_CARD') return after;
    if (after === before) return after;
    if (after.phase === 'round_end' || after.phase === 'game_over') return after;
    const playedCard = before.players[before.currentPlayerIndex]?.hand.find(c => c.id === action.cardId);
    if (!playedCard || (playedCard.type !== 'draw_two' && playedCard.type !== 'wild_draw_four')) return after;
    const prevTopCard = before.discardPile[before.discardPile.length - 1];
    if (!prevTopCard || (prevTopCard.type !== 'draw_two' && prevTopCard.type !== 'wild_draw_four')) return after;

    const bonus = ctx.getCardDrawPenalty(playedCard);

    if (playedCard.type === 'draw_two') {
      const victimIdx = ctx.getNextAliveIndex(before.players, before.currentPlayerIndex, before.direction);
      const victimId = before.players[victimIdx]!.id;
      return ctx.startPenaltyDraw(after, victimId, 2, after.pendingPenaltyNextPlayerIndex ?? after.currentPlayerIndex);
    } else {
      // WD4 does not have a final penalty target until accept/challenge (or a
      // challenge-bypass/deflection rule) resolves. Keep this conditional
      // bonus separate from drawStack so it cannot affect normal-turn
      // legality.
      return {
        ...after,
        pendingRevengeDraws: (after.pendingRevengeDraws ?? 0) + bonus,
      };
    }
  },
};

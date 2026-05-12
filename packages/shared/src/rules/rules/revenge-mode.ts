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
    const playedCard = before.players[before.currentPlayerIndex]?.hand.find(c => c.id === action.cardId);
    if (!playedCard || (playedCard.type !== 'draw_two' && playedCard.type !== 'wild_draw_four')) return after;
    const prevTopCard = before.discardPile[before.discardPile.length - 1];
    if (!prevTopCard || (prevTopCard.type !== 'draw_two' && prevTopCard.type !== 'wild_draw_four')) return after;

    if (playedCard.type === 'draw_two') {
      const victimIdx = ctx.getNextPlayerIndex(before.currentPlayerIndex, before.players.length, before.direction);
      const victimId = before.players[victimIdx]!.id;
      return ctx.startPenaltyDraw(after, victimId, 2, after.pendingPenaltyNextPlayerIndex ?? after.currentPlayerIndex);
    } else {
      return { ...after, drawStack: after.drawStack + 4 };
    }
  },
};

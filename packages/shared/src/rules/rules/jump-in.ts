import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext, PreCheckResult } from '../house-rule-types';

export const jumpIn: HouseRulePlugin = {
  meta: {
    id: 'jump-in',
    keys: ['jumpIn'],
    label: '同牌抢出',
    description: '持有完全相同的牌可不等轮次直接出',
  },
  isEnabled: (hr) => hr.jumpIn,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (action.type !== 'PLAY_CARD') return { handled: false };
    if (state.phase !== 'playing') return { handled: false };
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id === action.playerId) return { handled: false };

    const jumperIdx = state.players.findIndex(p => p.id === action.playerId);
    if (jumperIdx === -1) return { handled: true, state };
    const jumper = state.players[jumperIdx]!;
    const card = jumper.hand.find(c => c.id === action.cardId);
    if (!card) return { handled: true, state };
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (!topCard) return { handled: true, state };

    const exactMatch =
      card.type === topCard.type &&
      card.color === topCard.color &&
      (card.type !== 'number' || (topCard.type === 'number' && card.value === topCard.value));

    if (exactMatch) {
      const newHand = jumper.hand.filter(c => c.id !== action.cardId);
      const players = state.players.map((p, i) =>
        i === jumperIdx ? { ...p, hand: newHand } : p,
      );
      const nextIdx = ctx.getNextPlayerIndex(jumperIdx, players.length, state.direction);
      return {
        handled: true,
        state: {
          ...state,
          players,
          discardPile: [...state.discardPile, card],
          currentColor: card.color ?? state.currentColor,
          currentPlayerIndex: nextIdx,
          lastAction: action,
        },
      };
    }
    return { handled: true, state };
  },
};

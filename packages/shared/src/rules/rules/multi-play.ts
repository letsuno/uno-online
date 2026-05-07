import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext, PreCheckResult } from '../house-rule-types';

export const multiPlayPass: HouseRulePlugin = {
  meta: {
    id: 'multi-play-pass',
    keys: ['multiplePlaySameNumber', 'bombCard'],
    label: '同数字全出（结束）',
    description: '相同数字不同颜色可一次打出',
  },
  isEnabled: (hr) => hr.multiplePlaySameNumber || hr.bombCard,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (action.type !== 'PASS') return { handled: false };
    if (state.phase !== 'playing') return { handled: false };
    const hr = state.settings.houseRules;
    const player = state.players[state.currentPlayerIndex];
    if (player?.id !== action.playerId || state.lastAction?.type !== 'PLAY_CARD') return { handled: false };
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (topCard?.type !== 'number') return { handled: false };

    const nextIdx = ctx.getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.direction);
    let result: GameState = { ...state, currentPlayerIndex: nextIdx, lastAction: action };

    if (hr.bombCard) {
      const topValue = topCard.value;
      let bombCount = 0;
      for (let i = state.discardPile.length - 1; i >= 0; i--) {
        const c = state.discardPile[i]!;
        if (c.type === 'number' && c.value === topValue) bombCount++;
        else break;
      }
      if (bombCount >= 3) {
        for (const p of result.players) {
          if (p.id !== player.id) {
            result = ctx.drawCardsFromDeck(result, p.id, 1);
          }
        }
      }
    }

    return { handled: true, state: result };
  },
};

export const multiPlayPost: HouseRulePlugin = {
  meta: {
    id: 'multi-play-post',
    keys: ['multiplePlaySameNumber', 'bombCard'],
    label: '同数字全出（保持回合）',
    description: '相同数字不同颜色可一次打出',
  },
  isEnabled: (hr) => hr.multiplePlaySameNumber || hr.bombCard,
  postProcess: (before: GameState, after: GameState, action: GameAction, _ctx: RuleContext): GameState => {
    if (action.type !== 'PLAY_CARD') return after;
    if (after === before) return after;
    const playedCard = before.players[before.currentPlayerIndex]?.hand.find(c => c.id === action.cardId);
    if (playedCard?.type !== 'number') return after;
    const playerAfter = after.players[before.currentPlayerIndex];
    if (playerAfter && playerAfter.hand.some(c => c.type === 'number' && c.value === playedCard.value)) {
      return { ...after, currentPlayerIndex: before.currentPlayerIndex };
    }
    return after;
  },
};

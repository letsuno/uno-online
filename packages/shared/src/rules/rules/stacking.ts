import type { HouseRulePlugin } from '../house-rule-types.js';
import type { GameState, GameAction } from '../../types/game.js';
import type { RuleContext, PreCheckResult } from '../house-rule-types.js';
import { isWildCard } from '../../types/card.js';
import { canStackOnto } from '../stack-rules.js';

export const stacking: HouseRulePlugin = {
  meta: {
    id: 'stacking',
    keys: ['stackDrawTwo', 'stackDrawFour', 'crossStack', 'flipStackDrawOne', 'flipStackDrawFive', 'flipStackWildDraw', 'flipEscalateOnly'],
    label: '罚摸叠加',
    description: '被罚摸牌打中时可叠加给下家（经典 +2/+4，Flip +1/+5/万能罚摸）',
  },
  isEnabled: (hr) => hr.stackDrawTwo || hr.stackDrawFour || hr.crossStack
    || hr.flipStackDrawOne || hr.flipStackDrawFive || hr.flipStackWildDraw,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    const hr = state.settings.houseRules;

    if (action.type === 'PASS' && state.drawStack > 0) {
      return { handled: true, state };
    }

    // Case (0): PLAY_CARD during challenging phase — stack instead of challenge/accept
    if (action.type === 'PLAY_CARD' && state.phase === 'challenging' && state.pendingDrawPlayerId) {
      if (action.playerId !== state.pendingDrawPlayerId) return { handled: false };
      const playerIdx = state.players.findIndex(p => p.id === action.playerId);
      if (playerIdx === -1) return { handled: true, state };
      const player = state.players[playerIdx]!;
      const card = player.hand.find(c => c.id === action.cardId);
      if (!card) return { handled: true, state };
      const topDuringChallenge = state.discardPile[state.discardPile.length - 1];
      const canStack = topDuringChallenge !== undefined && canStackOnto(card, topDuringChallenge, hr);
      if (!canStack) return { handled: false };

      if (card.type === 'wild_draw_four' && !action.chosenColor) {
        return {
          handled: true,
          state: {
            ...state,
            phase: 'choosing_color',
            currentPlayerIndex: playerIdx,
          },
        };
      }

      const baseState: GameState = {
        ...state,
        phase: 'playing',
        pendingDrawPlayerId: null,
        drawStack: 4,
        currentPlayerIndex: playerIdx,
      };
      return { handled: true, state: ctx.putAttackCardOnStack(baseState, action, card, ctx.getCardDrawPenalty(card)) };
    }

    // Case (a): PLAY_CARD when drawStack > 0 — try to stack
    if (action.type === 'PLAY_CARD' && state.drawStack > 0) {
      const player = state.players[state.currentPlayerIndex];
      if (!player || player.id !== action.playerId) return { handled: true, state };
      const card = player.hand.find(c => c.id === action.cardId);
      if (!card) return { handled: true, state };
      const topCard = state.discardPile[state.discardPile.length - 1];
      const canStack = topCard !== undefined && canStackOnto(card, topCard, hr);
      if (canStack) {
        return { handled: true, state: ctx.putAttackCardOnStack(state, action, card, ctx.getCardDrawPenalty(card)) };
      }
      return { handled: true, state };
    }

    // Case (b): PLAY_CARD when drawStack === 0 — start new stack
    // Skip wild_draw_four here so it goes through the normal choosing_color → challenging flow
    if (action.type === 'PLAY_CARD' && state.drawStack === 0 && state.phase === 'playing') {
      const player = state.players[state.currentPlayerIndex];
      if (player?.id !== action.playerId) return { handled: false };
      const card = player.hand.find(c => c.id === action.cardId);
      // 万能罚摸牌走正常的 选色 → 质疑 流程，不在这里起叠
      if (card && isWildCard(card) && ctx.getCardDrawPenalty(card) > 0) return { handled: false };
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
      if ((state.pendingPenaltyDraws ?? 0) > 0) return { handled: false };
      const player = state.players[state.currentPlayerIndex];
      if (!player || player.id !== action.playerId) return { handled: true, state };
      const nextIdx = ctx.getNextAliveIndex(state.players, state.currentPlayerIndex, state.direction);
      const pendingState = ctx.startPenaltyDraw(
        { ...state, drawStack: 0, lastAction: action },
        action.playerId,
        state.drawStack,
        nextIdx,
        state.lastAction?.type === 'PLAY_CARD' ? state.lastAction.playerId : null,
      );
      const newState = ctx.applyAction(pendingState, action);
      return { handled: true, state: newState };
    }

    return { handled: false };
  },
};

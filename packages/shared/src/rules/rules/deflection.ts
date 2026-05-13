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
    const hr = state.settings.houseRules;

    // During challenging phase: deflect WD4 with Reverse or Skip
    if (action.type === 'PLAY_CARD' && state.phase === 'challenging' && state.pendingDrawPlayerId) {
      if (action.playerId !== state.pendingDrawPlayerId) return { handled: false };
      const playerIdx = state.players.findIndex(p => p.id === action.playerId);
      if (playerIdx === -1) return { handled: true, state };
      const player = state.players[playerIdx]!;
      const card = player.hand.find(c => c.id === action.cardId);
      if (!card) return { handled: true, state };
      const topCard = state.discardPile[state.discardPile.length - 1];

      if (hr.reverseDeflectDrawFour && card.type === 'reverse' && topCard?.type === 'wild_draw_four') {
        const newHand = player.hand.filter(c => c.id !== action.cardId);
        const newDirection = state.direction === 'clockwise' ? 'counter_clockwise' : 'clockwise';
        const players = state.players.map((p, i) =>
          i === playerIdx ? { ...p, hand: newHand } : p,
        );
        const wd4PlayerIdx = state.currentPlayerIndex;
        const wd4PlayerId = state.players[wd4PlayerIdx]!.id;
        const afterPenaltyNextIdx = ctx.getNextPlayerIndex(wd4PlayerIdx, players.length, newDirection);
        const baseState = checkRoundEnd({
          ...state,
          players,
          discardPile: [...state.discardPile, card],
          currentColor: card.color ?? state.currentColor,
          direction: newDirection,
          phase: 'playing',
          pendingDrawPlayerId: null,
          lastAction: action,
        }, action.playerId);
        return {
          handled: true,
          state: ctx.startPenaltyDraw(baseState, wd4PlayerId, 4, afterPenaltyNextIdx, action.playerId),
        };
      }

      if (hr.skipDeflect && card.type === 'skip') {
        const newHand = player.hand.filter(c => c.id !== action.cardId);
        const players = state.players.map((p, i) =>
          i === playerIdx ? { ...p, hand: newHand } : p,
        );
        const nextIdx = ctx.getNextPlayerIndex(playerIdx, players.length, state.direction);
        const nextPlayerId = state.players[nextIdx]!.id;
        const afterPenaltyNextIdx = ctx.getNextPlayerIndex(nextIdx, players.length, state.direction);
        const baseState = checkRoundEnd({
          ...state,
          players,
          discardPile: [...state.discardPile, card],
          currentColor: card.color ?? state.currentColor,
          phase: 'playing',
          pendingDrawPlayerId: null,
          lastAction: action,
        }, action.playerId);
        return {
          handled: true,
          state: ctx.startPenaltyDraw(baseState, nextPlayerId, 4, afterPenaltyNextIdx, action.playerId),
        };
      }

      return { handled: false };
    }

    if (action.type !== 'PLAY_CARD' || state.drawStack <= 0) return { handled: false };
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

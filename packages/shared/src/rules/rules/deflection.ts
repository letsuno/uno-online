import type { HouseRulePlugin } from '../house-rule-types.js';
import type { GameState, GameAction } from '../../types/game.js';
import type { RuleContext, PreCheckResult } from '../house-rule-types.js';
import { checkRoundEnd } from '../game-engine.js';
import { canDeflect, resolvePenalty } from '../stack-rules.js';

export const deflection: HouseRulePlugin = {
  meta: {
    id: 'deflection',
    keys: ['reverseDeflectDrawTwo', 'reverseDeflectDrawFour', 'skipDeflect', 'flipReverseDeflect', 'flipSkipDeflect'],
    label: 'Reverse/Skip 反弹',
    description: '被罚摸牌打中时出 Reverse 反弹给上家或 Skip 转移给下家',
  },
  isEnabled: (hr) => hr.reverseDeflectDrawTwo || hr.reverseDeflectDrawFour || hr.skipDeflect
    || hr.flipReverseDeflect || hr.flipSkipDeflect,
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

      if (card.type === 'reverse' && topCard !== undefined && canDeflect(card, topCard, hr)) {
        const newHand = player.hand.filter(c => c.id !== action.cardId);
        const newDirection = state.direction === 'clockwise' ? 'counter_clockwise' : 'clockwise';
        const players = state.players.map((p, i) =>
          i === playerIdx ? { ...p, hand: newHand } : p,
        );
        const wd4PlayerIdx = state.currentPlayerIndex;
        const wd4PlayerId = state.players[wd4PlayerIdx]!.id;
        const afterPenaltyNextIdx = ctx.getNextAliveIndex(players, wd4PlayerIdx, newDirection);
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
        const penalty = resolvePenalty(topCard, state.currentColor);
        return {
          handled: true,
          state: ctx.startPenaltyDraw(baseState, wd4PlayerId, penalty.count, afterPenaltyNextIdx, action.playerId, penalty.untilColor),
        };
      }

      if ((card.type === 'skip' || card.type === 'skip_everyone') && topCard !== undefined && canDeflect(card, topCard, hr)) {
        const newHand = player.hand.filter(c => c.id !== action.cardId);
        const players = state.players.map((p, i) =>
          i === playerIdx ? { ...p, hand: newHand } : p,
        );
        const nextIdx = ctx.getNextAliveIndex(players, playerIdx, state.direction);
        const nextPlayerId = state.players[nextIdx]!.id;
        const afterPenaltyNextIdx = ctx.getNextAliveIndex(players, nextIdx, state.direction);
        const baseState = checkRoundEnd({
          ...state,
          players,
          discardPile: [...state.discardPile, card],
          currentColor: card.color ?? state.currentColor,
          phase: 'playing',
          pendingDrawPlayerId: null,
          lastAction: action,
        }, action.playerId);
        const penalty = resolvePenalty(topCard, state.currentColor);
        return {
          handled: true,
          state: ctx.startPenaltyDraw(baseState, nextPlayerId, penalty.count, afterPenaltyNextIdx, action.playerId, penalty.untilColor),
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

    const canReverseDeflect = card.type === 'reverse' && topCard !== undefined && canDeflect(card, topCard, hr);

    if (canReverseDeflect) {
      const newHand = player.hand.filter(c => c.id !== action.cardId);
      const newDirection = state.direction === 'clockwise' ? 'counter_clockwise' : 'clockwise';
      const players = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? { ...p, hand: newHand } : p,
      );
      const nextIdx = ctx.getNextAliveIndex(players, state.currentPlayerIndex, newDirection);
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

    if ((card.type === 'skip' || card.type === 'skip_everyone') && topCard !== undefined && canDeflect(card, topCard, hr)) {
      const newHand = player.hand.filter(c => c.id !== action.cardId);
      const players = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? { ...p, hand: newHand } : p,
      );
      const nextIdx = ctx.getNextAliveIndex(players, state.currentPlayerIndex, state.direction);
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

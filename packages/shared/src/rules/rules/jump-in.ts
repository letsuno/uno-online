import type { HouseRulePlugin } from '../house-rule-types.js';
import type { GameState, GameAction } from '../../types/game.js';
import type { RuleContext, PreCheckResult } from '../house-rule-types.js';
import { isExactJumpInMatch } from '../validation.js';
import { reverseDirection } from '../turn.js';

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
    if ((state.pendingPenaltyDraws ?? 0) > 0 || state.drawStack > 0) return { handled: false };
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id === action.playerId) return { handled: false };

    const jumperIdx = state.players.findIndex(p => p.id === action.playerId);
    if (jumperIdx === -1) return { handled: true, state };
    const jumper = state.players[jumperIdx]!;
    const card = jumper.hand.find(c => c.id === action.cardId);
    if (!card) return { handled: true, state };
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (!topCard) return { handled: true, state };

    if (isExactJumpInMatch(card, topCard)) {
      const newHand = jumper.hand.filter(c => c.id !== action.cardId);
      const players = state.players.map((p, i) =>
        i === jumperIdx ? { ...p, hand: newHand } : p,
      );
      const nextIdx = ctx.getNextPlayerIndex(jumperIdx, players.length, state.direction);
      const baseState: GameState = {
        ...state,
        players,
        discardPile: [...state.discardPile, card],
        currentPlayerIndex: nextIdx,
        lastAction: { ...action, isJumpIn: true },
      };

      switch (card.type) {
        case 'skip': {
          return {
            handled: true,
            state: ctx.checkRoundEnd({
              ...baseState,
              currentColor: card.color,
              currentPlayerIndex: ctx.getNextPlayerIndex(jumperIdx, players.length, state.direction, 1),
            }, action.playerId),
          };
        }

        case 'reverse': {
          const newDirection = reverseDirection(state.direction);
          const newIdx = players.length === 2
            ? jumperIdx
            : ctx.getNextPlayerIndex(jumperIdx, players.length, newDirection);
          return {
            handled: true,
            state: ctx.checkRoundEnd({
              ...baseState,
              currentColor: card.color,
              direction: newDirection,
              currentPlayerIndex: newIdx,
            }, action.playerId),
          };
        }

        case 'draw_two': {
          const drawTarget = players[nextIdx]?.id;
          if (!drawTarget) break;
          const skipNext = ctx.getNextPlayerIndex(jumperIdx, players.length, state.direction, 1);
          let penaltyState = ctx.startPenaltyDraw(
            { ...baseState, currentColor: card.color },
            drawTarget, 2, skipNext, action.playerId,
          );
          if (state.settings.houseRules.revengeMode && (topCard.type === 'draw_two' || topCard.type === 'wild_draw_four')) {
            penaltyState = ctx.startPenaltyDraw(penaltyState, drawTarget, 2, skipNext);
          }
          return {
            handled: true,
            state: ctx.checkRoundEnd(penaltyState, action.playerId),
          };
        }

        case 'wild': {
          if (action.chosenColor) {
            const discardPile = [...baseState.discardPile];
            discardPile[discardPile.length - 1] = { ...card, chosenColor: action.chosenColor };
            return {
              handled: true,
              state: ctx.checkRoundEnd({
                ...baseState,
                discardPile,
                currentColor: action.chosenColor,
              }, action.playerId),
            };
          }
          return {
            handled: true,
            state: ctx.checkRoundEnd({
              ...baseState,
              phase: 'choosing_color',
              currentPlayerIndex: jumperIdx,
            }, action.playerId),
          };
        }

        case 'wild_draw_four': {
          if (action.chosenColor) {
            const discardPile = [...baseState.discardPile];
            discardPile[discardPile.length - 1] = { ...card, chosenColor: action.chosenColor };
            return {
              handled: true,
              state: ctx.checkRoundEnd({
                ...baseState,
                discardPile,
                currentColor: action.chosenColor,
                phase: 'challenging',
                currentPlayerIndex: jumperIdx,
                pendingDrawPlayerId: players[nextIdx]?.id ?? null,
              }, action.playerId),
            };
          }
          return {
            handled: true,
            state: ctx.checkRoundEnd({
              ...baseState,
              phase: 'choosing_color',
              currentPlayerIndex: jumperIdx,
              pendingDrawPlayerId: players[nextIdx]?.id ?? null,
            }, action.playerId),
          };
        }

        case 'number': {
          const hr = state.settings.houseRules;
          if (hr.sevenSwapHands && card.value === 7) {
            return {
              handled: true,
              state: ctx.checkRoundEnd({
                ...baseState,
                currentColor: card.color,
                phase: 'choosing_swap_target',
                currentPlayerIndex: jumperIdx,
              }, action.playerId),
            };
          }
          if (hr.zeroRotateHands && card.value === 0) {
            const hands = players.map(p => [...p.hand]);
            const rotatedPlayers = players.map((p, i) => {
              const sourceIdx = state.direction === 'clockwise'
                ? (i - 1 + players.length) % players.length
                : (i + 1) % players.length;
              return { ...p, hand: hands[sourceIdx]! };
            });
            return {
              handled: true,
              state: ctx.checkRoundEnd({
                ...baseState,
                players: rotatedPlayers,
                currentColor: card.color,
              }, action.playerId),
            };
          }
          return {
            handled: true,
            state: ctx.checkRoundEnd({
              ...baseState,
              currentColor: card.color,
            }, action.playerId),
          };
        }
      }

      return {
        handled: true,
        state: ctx.checkRoundEnd({
          ...baseState,
          currentColor: card.color ?? state.currentColor,
        }, action.playerId),
      };
    }
    return { handled: true, state };
  },
};

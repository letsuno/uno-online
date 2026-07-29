import type { GameState, GameAction } from '../types/game.js';
import type { Card } from '../types/card.js';
import type { Color } from '../types/card.js';
import { isWildCard } from '../types/card.js';
import { canPlayCard } from './validation.js';
import { canStartStack } from './stack-rules.js';
import { getNextPlayerIndex, getNextAliveIndex, countAlivePlayers, rotateHands } from './turn.js';
import { applyAction, checkRoundEnd, startPenaltyDraw, drawCards } from './game-engine.js';
import type { RuleContext } from './house-rule-types.js';

export function drawCardsFromDeck(state: GameState, playerId: string, count: number): GameState {
  const side = state.deckLeft.length >= state.deckRight.length ? 'left' : 'right';
  return drawCards(state, playerId, count, side);
}

export function hasPendingDrawObligation(state: GameState): boolean {
  return (state.pendingPenaltyDraws ?? 0) > 0 || state.drawStack > 0;
}

export function hasPlayableCard(
  hand: Card[],
  topCard: Card | undefined,
  currentColor: Color | null,
  canPlay: (card: Card, topCard: Card, currentColor: Color) => boolean = canPlayCard,
): boolean {
  if (!topCard || !currentColor) return false;
  return hand.some(card => canPlay(card, topCard, currentColor));
}

export function isLastCard(state: GameState, playerId: string, cardId: string): boolean {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return false;
  return player.hand.length === 1 && player.hand[0]!.id === cardId;
}

/** 罚摸类功能牌。用于「空手赢不算」等末牌限制村规，需要覆盖 Flip 卡型。 */
export function isFunctionCard(card: Card): boolean {
  return card.type === 'draw_two'
    || card.type === 'wild_draw_four'
    || card.type === 'draw_one'
    || card.type === 'draw_five'
    || card.type === 'wild_draw_two'
    || card.type === 'wild_draw_color';
}

export function getCardDrawPenalty(card: Card): number {
  if (card.type === 'draw_two') return 2;
  if (card.type === 'wild_draw_four') return 4;
  if (card.type === 'draw_one') return 1;
  if (card.type === 'draw_five') return 5;
  if (card.type === 'wild_draw_two') return 2;
  // Wild Draw Color 的张数不确定（摸到指定色为止），走 pendingPenaltyUntilColor 而非固定张数
  return 0;
}

export function canStartDrawStack(state: GameState, card: Card): boolean {
  return canStartStack(card, state.settings.houseRules);
}

export function putAttackCardOnStack(
  state: GameState,
  action: Extract<GameAction, { type: 'PLAY_CARD' }>,
  card: Card,
  stackAdd: number,
): GameState {
  if (card.type === 'wild_draw_four' && !action.chosenColor) {
    return state;
  }

  const player = state.players[state.currentPlayerIndex]!;
  const newHand = player.hand.filter(c => c.id !== action.cardId);
  const playedCard =
    card.type === 'wild_draw_four' && action.chosenColor
      ? { ...card, chosenColor: action.chosenColor }
      : card;
  const players = state.players.map((p, i) =>
    i === state.currentPlayerIndex ? { ...p, hand: newHand, calledUno: newHand.length === 1 ? p.calledUno : false, unoCaught: false } : p,
  );
  const nextIdx = getNextAliveIndex(players, state.currentPlayerIndex, state.direction);
  const newColor = card.type === 'draw_two' ? card.color : (action.chosenColor ?? state.currentColor);

  return checkRoundEnd({
    ...state,
    players,
    discardPile: [...state.discardPile, playedCard],
    currentColor: newColor,
    drawStack: state.drawStack + stackAdd,
    currentPlayerIndex: nextIdx,
    lastAction: action,
  }, action.playerId);
}

export function applyDoubleScore(before: GameState, after: GameState): GameState {
  if (!after.settings.houseRules.doubleScore) return after;
  if (
    (after.phase === 'round_end' || after.phase === 'game_over') &&
    before.phase === 'playing' &&
    after.winnerId !== null
  ) {
    const winnerId = after.winnerId;
    const beforeScore = before.players.find(p => p.id === winnerId)?.score ?? 0;
    const afterScore = after.players.find(p => p.id === winnerId)?.score ?? 0;
    const earned = afterScore - beforeScore;
    if (earned > 0) {
      const players = after.players.map(p =>
        p.id === winnerId ? { ...p, score: beforeScore + earned * 2 } : p,
      );
      return { ...after, players };
    }
  }
  return after;
}

export function handleDrawUntilPlayable(state: GameState, action: Extract<GameAction, { type: 'DRAW_CARD' }>): GameState {
  return applyAction(state, action);
}

export function handleForcedPlayAfterDraw(stateAfterDraw: GameState, originalAction: Extract<GameAction, { type: 'DRAW_CARD' }>): GameState {
  const player = stateAfterDraw.players[stateAfterDraw.currentPlayerIndex]!;
  if (player.hand.length === 0) return stateAfterDraw;

  const drawnCard = player.hand[player.hand.length - 1]!;
  const topCard = stateAfterDraw.discardPile[stateAfterDraw.discardPile.length - 1]!;
  const currentColor = stateAfterDraw.currentColor!;

  if (!canPlayCard(drawnCard, topCard, currentColor)) {
    return stateAfterDraw;
  }

  const playAction: GameAction = { type: 'PLAY_CARD', playerId: originalAction.playerId, cardId: drawnCard.id };
  return applyAction(stateAfterDraw, playAction);
}

export function buildRuleContext(): RuleContext {
  return {
    applyAction,
    checkRoundEnd,
    drawCardsFromDeck,
    startPenaltyDraw,
    putAttackCardOnStack,
    getCardDrawPenalty,
    canStartDrawStack,
    isLastCard,
    isWildCard,
    isFunctionCard,
    handleDrawUntilPlayable,
    handleForcedPlayAfterDraw,
    applyDoubleScore,
    canPlayCard,
    getNextPlayerIndex,
    getNextAliveIndex,
    countAlivePlayers,
    rotateHands,
  };
}

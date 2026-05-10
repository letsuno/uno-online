import type { GameState, GameAction, DrawSide } from '../types/game';
import type { Card } from '../types/card';
import type { Color } from '../types/card';
import type { PendingPenaltyDraw } from '../types/game';
import { isWildCard } from '../types/card';
import { reshuffleSideFromDiscard } from './deck';
import { canPlayCard } from './validation';
import { getNextPlayerIndex } from './turn';
import { applyAction, checkRoundEnd } from './game-engine';
import type { RuleContext } from './house-rule-types';

export function startPenaltyDraw(
  state: GameState,
  playerId: string,
  count: number,
  nextPlayerIndex: number,
  sourcePlayerId: string | null = null,
): GameState {
  if (count <= 0) return state;
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return state;
  const queue: PendingPenaltyDraw[] = state.pendingPenaltyDraws && state.pendingPenaltyDraws > 0
    ? [
        ...(state.pendingPenaltyQueue ?? []),
        { playerId, count, nextPlayerIndex, sourcePlayerId },
      ]
    : (state.pendingPenaltyQueue ?? []);

  if (state.pendingPenaltyDraws && state.pendingPenaltyDraws > 0) {
    return { ...state, pendingPenaltyQueue: queue };
  }

  return {
    ...state,
    phase: 'playing',
    currentPlayerIndex: playerIndex,
    pendingPenaltyDraws: count,
    pendingPenaltyNextPlayerIndex: nextPlayerIndex,
    pendingPenaltySourcePlayerId: sourcePlayerId,
    pendingPenaltyQueue: queue,
  };
}

export function drawCardsFromDeck(state: GameState, playerId: string, count: number): GameState {
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return state;
  const side: DrawSide = state.deckLeft.length >= state.deckRight.length ? 'left' : 'right';
  let sideDeck = side === 'left' ? [...state.deckLeft] : [...state.deckRight];
  let discardPile = [...state.discardPile];
  const initialCount = side === 'left' ? state.deckLeftInitialCount : state.deckRightInitialCount;
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (sideDeck.length === 0) {
      const r = reshuffleSideFromDiscard(sideDeck, discardPile, initialCount);
      sideDeck = r.sideDeck;
      discardPile = r.discardPile;
    }
    if (sideDeck.length === 0) break;
    drawn.push(sideDeck.shift()!);
  }
  const players = state.players.map((p, idx) =>
    idx === playerIndex ? { ...p, hand: [...p.hand, ...drawn], calledUno: false, unoCaught: false } : p,
  );
  return {
    ...state,
    players,
    deckLeft: side === 'left' ? sideDeck : state.deckLeft,
    deckRight: side === 'right' ? sideDeck : state.deckRight,
    discardPile,
  };
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

export function isWildType(card: Card): boolean {
  return isWildCard(card);
}

export function isFunctionCard(card: Card): boolean {
  return card.type === 'draw_two' || card.type === 'wild_draw_four';
}

export function getCardDrawPenalty(card: Card): number {
  if (card.type === 'draw_two') return 2;
  if (card.type === 'wild_draw_four') return 4;
  return 0;
}

export function canStartDrawStack(state: GameState, card: Card): boolean {
  const hr = state.settings.houseRules;
  if (card.type === 'draw_two') {
    return hr.stackDrawTwo || hr.crossStack;
  }
  if (card.type === 'wild_draw_four') {
    return hr.stackDrawFour || hr.crossStack;
  }
  return false;
}

export function putAttackCardOnStack(
  state: GameState,
  action: Extract<GameAction, { type: 'PLAY_CARD' }>,
  card: Card,
  stackAdd: number,
): GameState {
  const player = state.players[state.currentPlayerIndex]!;
  const newHand = player.hand.filter(c => c.id !== action.cardId);
  const playedCard =
    card.type === 'wild_draw_four' && action.chosenColor
      ? { ...card, chosenColor: action.chosenColor }
      : card;
  const players = state.players.map((p, i) =>
    i === state.currentPlayerIndex ? { ...p, hand: newHand, calledUno: newHand.length === 1 ? p.calledUno : false, unoCaught: false } : p,
  );
  const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction);
  const newColor = card.type === 'draw_two' ? card.color : (action.chosenColor ?? state.currentColor);

  return {
    ...state,
    players,
    discardPile: [...state.discardPile, playedCard],
    currentColor: newColor,
    drawStack: state.drawStack + stackAdd,
    currentPlayerIndex: nextIdx,
    lastAction: action,
  };
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
    isWildType,
    isFunctionCard,
    handleDrawUntilPlayable,
    handleForcedPlayAfterDraw,
    applyDoubleScore,
    canPlayCard,
    getNextPlayerIndex,
  };
}

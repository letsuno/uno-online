import type { Card, Color, HouseRules } from '@uno-online/shared';
import { getPlayableCards, canRespondToDrawStack, isExactJumpInMatch } from '@uno-online/shared';

export function getPlayableCardIds(params: {
  hand: Card[];
  topCard?: Card;
  currentColor: Color | null;
  drawStack: number;
  houseRules?: HouseRules;
}): Set<string> {
  const { hand, topCard, currentColor, drawStack, houseRules } = params;
  if (!topCard || !currentColor) return new Set();

  const playable = drawStack > 0
    ? hand.filter((card) => canRespondToDrawStack(card, topCard, houseRules))
    : getPlayableCards(hand, topCard, currentColor);

  return new Set(playable.map((card) => card.id));
}

export function getJumpInCardIds(hand: Card[], topCard?: Card): Set<string> {
  if (!topCard) return new Set();
  const ids = hand.filter((card) => isExactJumpInMatch(card, topCard)).map((card) => card.id);
  return new Set(ids);
}

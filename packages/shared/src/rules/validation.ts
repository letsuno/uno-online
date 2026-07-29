import type { Card, Color } from '../types/card.js';
import type { HouseRules } from '../types/house-rules.js';
import { isWildCard, isColoredCard } from '../types/card.js';
import { canDeflect, canStackOnto } from './stack-rules.js';

function getCardSymbol(card: Card): string | null {
  if (card.type === 'number') return `number_${card.value}`;
  if (isWildCard(card)) return null;
  return card.type;
}

export function canPlayCard(
  card: Card,
  topCard: Card,
  currentColor: Color,
  houseRules?: HouseRules,
): boolean {
  if (isWildCard(card)) {
    return true;
  }

  // 村规「Flip 万能出」：Flip 卡可无视颜色随时打出
  if (houseRules?.flipWildFlip && card.type === 'flip') {
    return true;
  }

  if (isColoredCard(card) && card.color === currentColor) {
    return true;
  }

  const cardSymbol = getCardSymbol(card);
  const topSymbol = getCardSymbol(topCard);
  if (cardSymbol !== null && topSymbol !== null && cardSymbol === topSymbol) {
    return true;
  }

  return false;
}

export function getPlayableCards(
  hand: readonly Card[],
  topCard: Card,
  currentColor: Color,
  houseRules?: HouseRules,
): Card[] {
  return hand.filter(card => canPlayCard(card, topCard, currentColor, houseRules));
}

export function isValidWildDrawFour(
  hand: readonly Card[],
  currentColor: Color,
): boolean {
  return !hand.some(card => isColoredCard(card) && card.color === currentColor);
}

export function canRespondToDrawStack(card: Card, topCard: Card, houseRules?: HouseRules): boolean {
  if (!houseRules) return false;
  return canStackOnto(card, topCard, houseRules) || canDeflect(card, topCard, houseRules);
}

export function isExactJumpInMatch(card: Card, topCard: Card): boolean {
  return (
    card.type === topCard.type &&
    card.color === topCard.color &&
    (card.type !== 'number' || (topCard.type === 'number' && card.value === topCard.value))
  );
}

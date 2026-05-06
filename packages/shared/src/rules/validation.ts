import type { Card, Color } from '../types/card';
import { isWildCard, isColoredCard } from '../types/card';

function getCardSymbol(card: Card): string | null {
  if (card.type === 'number') return `number_${card.value}`;
  if (card.type === 'skip') return 'skip';
  if (card.type === 'reverse') return 'reverse';
  if (card.type === 'draw_two') return 'draw_two';
  return null;
}

export function canPlayCard(
  card: Card,
  topCard: Card,
  currentColor: Color,
): boolean {
  if (isWildCard(card)) {
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
): Card[] {
  return hand.filter(card => canPlayCard(card, topCard, currentColor));
}

export function isValidWildDrawFour(
  hand: readonly Card[],
  currentColor: Color,
): boolean {
  return !hand.some(card => isColoredCard(card) && card.color === currentColor);
}

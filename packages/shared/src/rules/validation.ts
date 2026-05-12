import type { Card, Color } from '../types/card.js';
import type { HouseRules } from '../types/house-rules.js';
import { isWildCard, isColoredCard } from '../types/card.js';

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

export function canRespondToDrawStack(card: Card, topCard: Card, houseRules?: HouseRules): boolean {
  if (!houseRules) return false;

  return (
    (houseRules.stackDrawTwo && card.type === 'draw_two' && topCard.type === 'draw_two') ||
    (houseRules.stackDrawFour && card.type === 'wild_draw_four' && topCard.type === 'wild_draw_four') ||
    (houseRules.crossStack && (
      (card.type === 'draw_two' && topCard.type === 'wild_draw_four') ||
      (card.type === 'wild_draw_four' && topCard.type === 'draw_two')
    )) ||
    (houseRules.reverseDeflectDrawTwo && card.type === 'reverse' && topCard.type === 'draw_two') ||
    (houseRules.reverseDeflectDrawFour && card.type === 'reverse' && topCard.type === 'wild_draw_four') ||
    (houseRules.skipDeflect && card.type === 'skip')
  );
}

export function isExactJumpInMatch(card: Card, topCard: Card): boolean {
  return (
    card.type === topCard.type &&
    card.color === topCard.color &&
    (card.type !== 'number' || (topCard.type === 'number' && card.value === topCard.value))
  );
}

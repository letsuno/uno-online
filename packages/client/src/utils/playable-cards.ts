import type { Card, Color, HouseRules } from '@uno-online/shared';
import { getPlayableCards } from '@uno-online/shared';

export function canRespondToDrawStack(card: Card, topCard: Card, houseRules?: HouseRules): boolean {
  if (!houseRules) return false;

  const canStack =
    (houseRules.stackDrawTwo && card.type === 'draw_two' && topCard.type === 'draw_two') ||
    (houseRules.stackDrawFour && card.type === 'wild_draw_four' && topCard.type === 'wild_draw_four') ||
    (
      houseRules.crossStack &&
      (
        (card.type === 'draw_two' && topCard.type === 'wild_draw_four') ||
        (card.type === 'wild_draw_four' && topCard.type === 'draw_two')
      )
    );
  const canDeflect =
    (houseRules.reverseDeflectDrawTwo && card.type === 'reverse' && topCard.type === 'draw_two') ||
    (houseRules.reverseDeflectDrawFour && card.type === 'reverse' && topCard.type === 'wild_draw_four') ||
    (houseRules.skipDeflect && card.type === 'skip');

  return canStack || canDeflect;
}

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

export type Color = 'red' | 'blue' | 'green' | 'yellow';

export type CardType = 'number' | 'skip' | 'reverse' | 'draw_two' | 'wild' | 'wild_draw_four';

export interface NumberCard {
  id: string;
  type: 'number';
  color: Color;
  value: number;
}

export interface SkipCard {
  id: string;
  type: 'skip';
  color: Color;
}

export interface ReverseCard {
  id: string;
  type: 'reverse';
  color: Color;
}

export interface DrawTwoCard {
  id: string;
  type: 'draw_two';
  color: Color;
}

export interface WildCard {
  id: string;
  type: 'wild';
  color: null;
  chosenColor?: Color;
}

export interface WildDrawFourCard {
  id: string;
  type: 'wild_draw_four';
  color: null;
  chosenColor?: Color;
}

export type ColoredCard = NumberCard | SkipCard | ReverseCard | DrawTwoCard;
export type WildCardType = WildCard | WildDrawFourCard;
export type Card = ColoredCard | WildCardType;

export function isColoredCard(card: Card): card is ColoredCard {
  return card.color !== null;
}

export function isWildCard(card: Card): card is WildCardType {
  return card.type === 'wild' || card.type === 'wild_draw_four';
}

export function getEffectiveColor(card: Card): Color | null {
  if (isWildCard(card)) {
    return card.chosenColor ?? null;
  }
  return card.color;
}

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

const COLOR_ORDER: Record<Color, number> = { red: 0, yellow: 1, blue: 2, green: 3 };
const TYPE_ORDER: Record<CardType, number> = {
  number: 0,
  skip: 1,
  reverse: 2,
  draw_two: 3,
  wild: 4,
  wild_draw_four: 5,
};

export function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const colorA = a.color === null ? 4 : COLOR_ORDER[a.color];
    const colorB = b.color === null ? 4 : COLOR_ORDER[b.color];
    if (colorA !== colorB) return colorA - colorB;

    const typeA = TYPE_ORDER[a.type];
    const typeB = TYPE_ORDER[b.type];
    if (typeA !== typeB) return typeA - typeB;

    const valA = a.type === 'number' ? a.value : 0;
    const valB = b.type === 'number' ? b.value : 0;
    return valA - valB;
  });
}

export function getEffectiveColor(card: Card): Color | null {
  if (isWildCard(card)) {
    return card.chosenColor ?? null;
  }
  return card.color;
}

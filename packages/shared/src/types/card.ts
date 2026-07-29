export type LightColor = 'red' | 'blue' | 'green' | 'yellow';
export type DarkColor = 'pink' | 'teal' | 'orange' | 'purple';
export type Color = LightColor | DarkColor;

export type CardType =
  // 经典 UNO
  | 'number' | 'skip' | 'reverse' | 'draw_two' | 'wild' | 'wild_draw_four'
  // UNO Flip 亮面新增
  | 'draw_one' | 'wild_draw_two' | 'flip'
  // UNO Flip 暗面新增
  | 'draw_five' | 'skip_everyone' | 'wild_draw_color';

/**
 * 一张牌的「另一面」。
 *
 * classic 模式下恒为 undefined；flip 模式下每张牌都有。
 * 不含 chosenColor——万能牌选定的颜色只在它作为活动面躺在弃牌堆顶时有意义，翻面后即失效。
 */
export interface CardBack {
  type: CardType;
  color: Color | null;
  value?: number;
}

interface CardCommon {
  id: string;
  /** flip 模式下为这张牌的背面；classic 模式为 undefined。 */
  back?: CardBack;
}

export interface NumberCard extends CardCommon {
  type: 'number';
  color: Color;
  value: number;
}

export interface SkipCard extends CardCommon {
  type: 'skip';
  color: Color;
}

export interface ReverseCard extends CardCommon {
  type: 'reverse';
  color: Color;
}

export interface DrawTwoCard extends CardCommon {
  type: 'draw_two';
  color: Color;
}

export interface DrawOneCard extends CardCommon {
  type: 'draw_one';
  color: Color;
}

export interface DrawFiveCard extends CardCommon {
  type: 'draw_five';
  color: Color;
}

export interface SkipEveryoneCard extends CardCommon {
  type: 'skip_everyone';
  color: Color;
}

export interface FlipCard extends CardCommon {
  type: 'flip';
  color: Color;
}

export interface WildCard extends CardCommon {
  type: 'wild';
  color: null;
  chosenColor?: Color;
}

export interface WildDrawFourCard extends CardCommon {
  type: 'wild_draw_four';
  color: null;
  chosenColor?: Color;
}

export interface WildDrawTwoCard extends CardCommon {
  type: 'wild_draw_two';
  color: null;
  chosenColor?: Color;
}

export interface WildDrawColorCard extends CardCommon {
  type: 'wild_draw_color';
  color: null;
  chosenColor?: Color;
}

export type ColoredCard =
  | NumberCard | SkipCard | ReverseCard | DrawTwoCard
  | DrawOneCard | DrawFiveCard | SkipEveryoneCard | FlipCard;
export type WildCardType = WildCard | WildDrawFourCard | WildDrawTwoCard | WildDrawColorCard;
export type Card = ColoredCard | WildCardType;

export const LIGHT_COLORS: readonly LightColor[] = ['red', 'blue', 'green', 'yellow'] as const;
export const DARK_COLORS: readonly DarkColor[] = ['pink', 'teal', 'orange', 'purple'] as const;

const WILD_TYPES = new Set<CardType>(['wild', 'wild_draw_four', 'wild_draw_two', 'wild_draw_color']);

export function isColoredCard(card: Card): card is ColoredCard {
  return card.color !== null;
}

export function isWildCard(card: Card): card is WildCardType {
  return WILD_TYPES.has(card.type);
}

/** 某一面可用的 4 种颜色。classic 恒为亮面四色。 */
export function colorsForSide(side: 'light' | 'dark'): readonly Color[] {
  return side === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}

/**
 * 全零的颜色计数表。键顺序 = 平局时的优先级，亮面 4 色在前以保持经典模式行为不变。
 */
export function emptyColorCounts(): Record<Color, number> {
  return { red: 0, blue: 0, green: 0, yellow: 0, pink: 0, teal: 0, orange: 0, purple: 0 };
}

export function isLightColor(color: Color): color is LightColor {
  return color === 'red' || color === 'blue' || color === 'green' || color === 'yellow';
}

/**
 * 排序权重。以 10 为步长留出插值空间，经典卡型的相对顺序与扩展前保持一致。
 */
const COLOR_ORDER: Record<string, number> = {
  red: 0, yellow: 10, blue: 20, green: 30,
  pink: 40, orange: 50, purple: 60, teal: 70,
};
const TYPE_ORDER: Record<string, number> = {
  number: 0,
  skip: 10,
  skip_everyone: 15,
  reverse: 20,
  draw_two: 30,
  draw_one: 31,
  draw_five: 32,
  flip: 35,
  wild: 40,
  wild_draw_four: 50,
  wild_draw_two: 51,
  wild_draw_color: 52,
};

export function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const colorA = COLOR_ORDER[a.color ?? ''] ?? 99;
    const colorB = COLOR_ORDER[b.color ?? ''] ?? 99;
    if (colorA !== colorB) return colorA - colorB;

    const typeA = TYPE_ORDER[a.type] ?? 99;
    const typeB = TYPE_ORDER[b.type] ?? 99;
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

/**
 * 去掉背面信息。
 *
 * 官方规则下玩家看不到自己手牌的背面，只看得到对手手牌的背面，
 * 因此下发给本人的手牌必须先剥掉 `back`（见设计文档 §5.2）。
 */
export function stripCardBack(card: Card): Card {
  if (!card.back) return card;
  const { back: _back, ...rest } = card;
  return rest as Card;
}

/** 取一张牌的背面；单面牌（classic）返回 null。 */
export function cardBackOf(card: Card): CardBack | null {
  return card.back ?? null;
}

/**
 * 把一张牌翻到它的另一面。没有背面（classic）时原样返回。
 *
 * 翻面会丢弃万能牌的 chosenColor：翻面后原来的选色不再适用（见设计文档 §4.2）。
 */
export function swapFace(card: Card): Card {
  if (!card.back) return card;

  const front: CardBack = {
    type: card.type,
    color: card.color,
    ...(card.type === 'number' ? { value: card.value } : {}),
  };

  return {
    id: card.id,
    type: card.back.type,
    color: card.back.color,
    ...(card.back.value !== undefined ? { value: card.back.value } : {}),
    back: front,
  } as Card;
}

import type { Card, CardBack, CardType } from '../types/card.js';
import { isLightColor } from '../types/card.js';
import { COLORS } from '../constants/deck.js';
import { FLIP_CARD_PAIRS } from '../constants/flip-deck.js';

export function createDeck(): Card[] {
  let counter = 0;
  const nextId = (): string => `card_${++counter}`;
  const cards: Card[] = [];

  for (const color of COLORS) {
    cards.push({ id: nextId(), type: 'number', color, value: 0 });

    for (let value = 1; value <= 9; value++) {
      cards.push({ id: nextId(), type: 'number', color, value });
      cards.push({ id: nextId(), type: 'number', color, value });
    }

    for (let i = 0; i < 2; i++) {
      cards.push({ id: nextId(), type: 'skip', color });
      cards.push({ id: nextId(), type: 'reverse', color });
      cards.push({ id: nextId(), type: 'draw_two', color });
    }
  }

  for (let i = 0; i < 4; i++) {
    cards.push({ id: nextId(), type: 'wild', color: null });
    cards.push({ id: nextId(), type: 'wild_draw_four', color: null });
  }

  return cards;
}

/**
 * 按实物牌组的固定配对表生成 112 张 UNO Flip 双面牌。
 *
 * 活动面为亮面（游戏从亮面开始），暗面存放在 `back`。
 * 配对表来源与校验见 `constants/flip-deck.ts`。
 */
export function createFlipDeck(): Card[] {
  let counter = 0;
  return FLIP_CARD_PAIRS.map(([light, dark]) => ({
    id: `card_${++counter}`,
    type: light.type,
    color: light.color,
    ...(light.value !== undefined ? { value: light.value } : {}),
    back: { ...dark },
  }) as Card);
}

export function shuffleDeck(deck: readonly Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

const WILD_TYPES = new Set<CardType>(['wild', 'wild_draw_four', 'wild_draw_two', 'wild_draw_color']);

/** 回收进牌堆前清掉万能牌选定的颜色。必须保留 `back`，否则 flip 模式下回收一次牌就丢了背面。 */
function clearWildColor(card: Card): Card {
  if (!WILD_TYPES.has(card.type)) return card;
  return {
    id: card.id,
    type: card.type,
    color: null,
    ...(card.back ? { back: card.back } : {}),
  } as Card;
}

export function reshuffleDiscardIntoDeck(
  currentDeck: readonly Card[],
  discardPile: readonly Card[],
): { deck: Card[]; discardPile: Card[] } {
  if (discardPile.length <= 1) {
    return { deck: [...currentDeck], discardPile: [...discardPile] };
  }

  const topCard = discardPile[discardPile.length - 1]!;
  const cardsToReshuffle = discardPile.slice(0, -1).map(clearWildColor);
  const newDeck = shuffleDeck([...currentDeck, ...cardsToReshuffle]);

  return { deck: newDeck, discardPile: [topCard] };
}

export function reshuffleSideFromDiscard(
  currentSideDeck: readonly Card[],
  discardPile: readonly Card[],
  targetCount: number,
): { sideDeck: Card[]; discardPile: Card[] } {
  if (discardPile.length <= 1) {
    return { sideDeck: [...currentSideDeck], discardPile: [...discardPile] };
  }

  const topCard = discardPile[discardPile.length - 1]!;
  const available = discardPile.slice(0, -1);
  const takeCount = Math.min(targetCount, available.length);
  const cardsToReshuffle = available.slice(0, takeCount).map(clearWildColor);
  const remainingDiscard = available.slice(takeCount);

  const newSideDeck = shuffleDeck([...currentSideDeck, ...cardsToReshuffle]);
  return { sideDeck: newSideDeck, discardPile: [...remainingDiscard, topCard] };
}

export interface CardFaceIdentity {
  color: Card['color'];
  type: CardType;
  value?: number;
}

/** 单面牌（classic）直接用牌面身份；双面牌（flip）用规范化的两面身份。 */
export type CardIdentity = CardFaceIdentity | { light: CardFaceIdentity; dark: CardFaceIdentity };

function faceIdentity(face: { color: Card['color']; type: CardType; value?: number }): CardFaceIdentity {
  const identity: CardFaceIdentity = { color: face.color, type: face.type };
  if (face.type === 'number' && face.value !== undefined) {
    identity.value = face.value;
  }
  return identity;
}

function faceIsLight(face: CardFaceIdentity, other: CardFaceIdentity): boolean {
  if (face.color !== null) return isLightColor(face.color);
  if (other.color !== null) return !isLightColor(other.color);
  // 两面都是万能牌——实物牌组中不存在这种配对，退化为字典序以保证顺序稳定
  return JSON.stringify(face) <= JSON.stringify(other);
}

/**
 * 卡牌身份，用于牌堆哈希（反作弊）。
 *
 * 双面牌的身份必须与当前活动面无关：否则每翻一次面 deckHash 就会变，
 * 客户端的反作弊校验会误报。因此这里按亮面 / 暗面归一化后输出两面。
 */
export function cardToIdentity(card: Card): CardIdentity {
  if (!card.back) return faceIdentity(card);

  const front = faceIdentity(card);
  const back = faceIdentity(card.back as CardBack & { color: Card['color'] });
  return faceIsLight(front, back) ? { light: front, dark: back } : { light: back, dark: front };
}

export function serializeDeck(deck: readonly Card[]): string {
  return JSON.stringify(deck.map(cardToIdentity));
}

export function serializeDecks(deckLeft: readonly Card[], deckRight: readonly Card[]): string {
  return JSON.stringify([...deckLeft, ...deckRight].map(cardToIdentity));
}

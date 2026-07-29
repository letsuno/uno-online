import type { GameState } from '../types/game.js';
import type { Card, CardType, Color } from '../types/card.js';
import { getEffectiveColor, isLightColor, swapFace } from '../types/card.js';
import { DARK_TO_LIGHT_COLOR, LIGHT_TO_DARK_COLOR } from '../constants/flip-deck.js';

/** 把一个颜色映射到另一面的对位色。仅供 UI 与 `flipKeepColorOnFlip` 村规使用。 */
export function oppositeSideColor(color: Color): Color {
  return isLightColor(color)
    ? LIGHT_TO_DARK_COLOR[color]
    : DARK_TO_LIGHT_COLOR[color];
}

/** 仅在 UNO Flip 中存在的卡型。 */
const FLIP_ONLY_TYPES = new Set<CardType>([
  'draw_one', 'draw_five', 'skip_everyone', 'flip', 'wild_draw_two', 'wild_draw_color',
]);

export function isFlipOnlyType(type: CardType): boolean {
  return FLIP_ONLY_TYPES.has(type);
}

/**
 * 把整局翻到另一面。这是唯一的翻面入口——任何散落的面切换都会让状态腐坏。
 *
 * 严格按官方顺序（Mattel GDR44）：
 *   1. 翻转弃牌堆整体——刚打出的 Flip 卡沉到堆底，原堆底成为新顶牌
 *   2. 翻转两个摸牌堆
 *   3. 所有玩家手牌翻面
 *
 * 翻面后 `currentColor` 由新顶牌的活动面决定；新顶牌若是万能牌则为 null，
 * 调用方需要据此进入选色阶段（见设计文档 §4.2）。
 */
export function flipAll(state: GameState): GameState {
  const discardPile = [...state.discardPile].reverse().map(swapFace);
  const topCard: Card | undefined = discardPile[discardPile.length - 1];

  let currentColor = topCard ? getEffectiveColor(topCard) : state.currentColor;
  // 村规「翻面保留颜色」：新顶牌是万能牌时不进选色，直接沿用对位色
  if (currentColor === null && state.settings.houseRules.flipKeepColorOnFlip && state.currentColor) {
    currentColor = oppositeSideColor(state.currentColor);
  }

  return {
    ...state,
    flipSide: state.flipSide === 'light' ? 'dark' : 'light',
    deckLeft: state.deckLeft.map(swapFace),
    deckRight: state.deckRight.map(swapFace),
    discardPile,
    players: state.players.map(p => ({ ...p, hand: p.hand.map(swapFace) })),
    currentColor,
  };
}

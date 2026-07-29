import type { Card } from '../types/card.js';
import type { GameMode } from '../types/game.js';

/**
 * 经典 UNO 计分表。
 *
 * 表内也列出了 Flip 专属卡型的分值，仅为让穷举保持完整——它们不会出现在经典牌组里。
 * Flip 模式走下面的 `FLIP_CARD_SCORES`（注意 `wild` 两边分值不同）。
 */
export const CARD_SCORES: Record<Card['type'], number | 'face_value'> = {
  number: 'face_value',
  skip: 20,
  reverse: 20,
  draw_two: 20,
  wild: 50,
  wild_draw_four: 50,
  draw_one: 10,
  draw_five: 20,
  skip_everyone: 30,
  flip: 20,
  wild_draw_two: 50,
  wild_draw_color: 60,
};

/**
 * UNO Flip 计分表（Mattel GDR44）。按结束时所处的那一面计分——
 * 方案 B 下卡牌的活动面就是当前面，因此直接查表即可。
 *
 * 与经典表的差异：`wild` 是 40 分而非 50 分。
 */
export const FLIP_CARD_SCORES: Record<Card['type'], number | 'face_value'> = {
  number: 'face_value',
  draw_one: 10,
  draw_five: 20,
  reverse: 20,
  skip: 20,
  flip: 20,
  skip_everyone: 30,
  wild: 40,
  wild_draw_two: 50,
  wild_draw_color: 60,
  // 经典专属卡型，不会出现在 Flip 牌组里
  draw_two: 20,
  wild_draw_four: 50,
};

export function getCardScore(card: Card, mode: GameMode = 'classic'): number {
  if (card.type === 'number') {
    return card.value;
  }
  const table = mode === 'flip' ? FLIP_CARD_SCORES : CARD_SCORES;
  return table[card.type] as number;
}

export const DEFAULT_TARGET_SCORE = 1000;
export const DEFAULT_TURN_TIME_LIMIT = 30;
export const UNO_PENALTY_CARDS = 2;

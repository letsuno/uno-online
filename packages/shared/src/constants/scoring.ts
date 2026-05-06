import type { Card } from '../types/card';

export const CARD_SCORES: Record<Card['type'], number | 'face_value'> = {
  number: 'face_value',
  skip: 20,
  reverse: 20,
  draw_two: 20,
  wild: 50,
  wild_draw_four: 50,
};

export function getCardScore(card: Card): number {
  if (card.type === 'number') {
    return card.value;
  }
  return CARD_SCORES[card.type] as number;
}

export const DEFAULT_TARGET_SCORE = 500;
export const DEFAULT_TURN_TIME_LIMIT = 30;
export const UNO_PENALTY_CARDS = 2;

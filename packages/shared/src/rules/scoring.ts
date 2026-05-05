import type { Card } from '../types/card.js';
import type { Player } from '../types/game.js';
import { getCardScore } from '../constants/scoring.js';

export function calculateRoundScore(hand: readonly Card[]): number {
  return hand.reduce((sum, card) => sum + getCardScore(card), 0);
}

export function calculateRoundScores(
  players: readonly Player[],
  winnerId: string,
): Record<string, number> {
  const scores: Record<string, number> = {};
  let winnerPoints = 0;

  for (const player of players) {
    if (player.id === winnerId) {
      scores[player.id] = 0;
    } else {
      const handScore = calculateRoundScore(player.hand);
      winnerPoints += handScore;
      scores[player.id] = 0;
    }
  }

  scores[winnerId] = winnerPoints;
  return scores;
}

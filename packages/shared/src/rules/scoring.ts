import type { Card } from '../types/card.js';
import type { GameMode, Player } from '../types/game.js';
import { getCardScore } from '../constants/scoring.js';

export function calculateRoundScore(hand: readonly Card[], mode: GameMode = 'classic'): number {
  return hand.reduce((sum, card) => sum + getCardScore(card, mode), 0);
}

export function calculateRoundScores(
  players: readonly Player[],
  winnerId: string,
  mode: GameMode = 'classic',
): Record<string, number> {
  const scores: Record<string, number> = {};
  let winnerPoints = 0;

  for (const player of players) {
    if (player.id === winnerId) {
      scores[player.id] = 0;
    } else {
      const handScore = calculateRoundScore(player.hand, mode);
      winnerPoints += handScore;
      scores[player.id] = 0;
    }
  }

  scores[winnerId] = winnerPoints;
  return scores;
}

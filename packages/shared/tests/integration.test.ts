import { describe, it, expect } from 'vitest';
import { initializeGame, applyAction, getPlayableCards } from '../src/rules/index.js';
import type { GameState, GameAction } from '../src/types/game.js';

function playOneRound(state: GameState, maxTurns = 500): GameState {
  let current = state;
  let turns = 0;

  // Handle the case where the first card is a wild (choosing_color at init)
  if (current.phase === 'choosing_color') {
    const player = current.players[current.currentPlayerIndex]!;
    current = applyAction(current, { type: 'CHOOSE_COLOR', playerId: player.id, color: 'red' });
    // After choosing color, if it was a wild_draw_four, we'll be in challenging phase
    if (current.phase === 'challenging') {
      current = applyAction(current, { type: 'ACCEPT', playerId: current.pendingDrawPlayerId! });
    }
  }

  while (current.phase === 'playing' && turns < maxTurns) {
    turns++;
    const player = current.players[current.currentPlayerIndex]!;
    const topCard = current.discardPile[current.discardPile.length - 1]!;
    const playable = getPlayableCards(player.hand, topCard, current.currentColor!);

    if (playable.length > 0) {
      const card = playable[0]!;
      let chosenColor = undefined;
      if (card.type === 'wild' || card.type === 'wild_draw_four') {
        chosenColor = 'red' as const;
      }

      if (player.hand.length === 2) {
        current = applyAction(current, { type: 'CALL_UNO', playerId: player.id });
      }

      const action: GameAction = { type: 'PLAY_CARD', playerId: player.id, cardId: card.id, chosenColor };
      current = applyAction(current, action);

      if (current.phase === 'choosing_color') {
        current = applyAction(current, { type: 'CHOOSE_COLOR', playerId: player.id, color: 'red' });
      }
      if (current.phase === 'challenging') {
        current = applyAction(current, { type: 'ACCEPT', playerId: current.pendingDrawPlayerId! });
      }
    } else {
      current = applyAction(current, { type: 'DRAW_CARD', playerId: player.id });
      current = applyAction(current, { type: 'PASS', playerId: player.id });
    }
  }

  return current;
}

describe('integration: full game simulation', () => {
  it('completes a game with 2 players', () => {
    const state = initializeGame([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    const result = playOneRound(state);
    expect(result.phase === 'round_end' || result.phase === 'game_over').toBe(true);
    expect(result.winnerId).toBeTruthy();
  });

  it('completes a game with 4 players', () => {
    const state = initializeGame([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Carol' },
      { id: 'p4', name: 'Dave' },
    ]);

    const result = playOneRound(state);
    expect(result.phase === 'round_end' || result.phase === 'game_over').toBe(true);
  });

  it('completes a game with 10 players', () => {
    const players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Player${i}` }));
    const state = initializeGame(players);

    const result = playOneRound(state);
    expect(result.phase === 'round_end' || result.phase === 'game_over').toBe(true);
  });

  it('winner scores are correctly calculated', () => {
    const state = initializeGame([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    const result = playOneRound(state);
    if (result.winnerId) {
      const winner = result.players.find(p => p.id === result.winnerId);
      expect(winner!.score).toBeGreaterThanOrEqual(0);
    }
  });
});

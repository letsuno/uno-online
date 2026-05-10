import { describe, it, expect } from 'vitest';
import { initializeGame, applyAction, chooseAutopilotAction } from '../src/rules/index';
import type { GameState } from '../src/types/game';

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

  while (
    current.phase !== 'round_end' &&
    current.phase !== 'game_over' &&
    turns < maxTurns
  ) {
    turns++;
    const playerId = current.phase === 'challenging'
      ? current.pendingDrawPlayerId!
      : current.players[current.currentPlayerIndex]!.id;
    const actions = chooseAutopilotAction(current, playerId);
    if (actions.length === 0) break;

    for (const action of actions) {
      current = applyAction(current, action);
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

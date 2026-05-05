import { describe, it, expect } from 'vitest';
import { GameSession } from '../../src/game/game-session.js';

describe('GameSession', () => {
  it('initializes a game with players', () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);
    const state = session.getFullState();
    expect(state.players).toHaveLength(2);
    expect(state.players[0]!.hand.length).toBeGreaterThanOrEqual(7);
  });

  it('returns sanitized state for a specific player', () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);
    const view = session.getPlayerView('p1');
    expect(view.players[0]!.hand.length).toBeGreaterThan(0);
    expect(view.players[1]!.hand).toEqual([]);
    expect(view.players[1]!.handCount).toBeGreaterThan(0);
    expect(view.deck).toBeUndefined();
  });

  it('applies a valid action', () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);
    const state = session.getFullState();
    const currentPlayer = state.players[state.currentPlayerIndex]!;
    const result = session.applyAction({ type: 'DRAW_CARD', playerId: currentPlayer.id });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid action', () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);
    const state = session.getFullState();
    const notCurrentPlayer = state.players[state.currentPlayerIndex === 0 ? 1 : 0]!;
    const result = session.applyAction({ type: 'DRAW_CARD', playerId: notCurrentPlayer.id });
    expect(result.success).toBe(false);
  });

  it('marks player disconnected', () => {
    const session = GameSession.create([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);
    session.setPlayerConnected('p1', false);
    const state = session.getFullState();
    expect(state.players[0]!.connected).toBe(false);
  });
});

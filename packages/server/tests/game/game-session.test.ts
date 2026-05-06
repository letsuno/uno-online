import { describe, it, expect } from 'vitest';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import { GameSession } from '../../src/game/game-session.js';
import { makeCard, makeGameState, makePlayer } from '../helpers/test-utils.js';

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
    expect(view.viewerId).toBe('p1');
  });

  it('only reveals opponent hands when the reveal threshold rule allows it', () => {
    const p1Hand = [makeCard('number', 'red', { value: 1, id: 'p1c' })];
    const p2Hand = [
      makeCard('number', 'blue', { value: 1, id: 'p2c1' }),
      makeCard('number', 'blue', { value: 2, id: 'p2c2' }),
    ];
    const state = makeGameState({
      players: [makePlayer('p1', p1Hand), makePlayer('p2', p2Hand)],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        houseRules: { ...DEFAULT_HOUSE_RULES, handRevealThreshold: null },
      },
    });

    const hiddenView = GameSession.fromState(state).getPlayerView('p1');
    expect(hiddenView.players[0]!.hand.map((c) => c.id)).toEqual(['p1c']);
    expect(hiddenView.players[1]!.hand).toEqual([]);
    expect(hiddenView.players[1]!.handCount).toBe(2);

    const revealedView = GameSession.fromState({
      ...state,
      settings: {
        ...state.settings,
        houseRules: { ...state.settings.houseRules, handRevealThreshold: 2 },
      },
    }).getPlayerView('p1');
    expect(revealedView.players[1]!.hand.map((c) => c.id)).toEqual(['p2c1', 'p2c2']);
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

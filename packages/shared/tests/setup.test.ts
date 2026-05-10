import { describe, it, expect } from 'vitest';
import { dealCards, handleFirstDiscard, initializeGame } from '../src/rules/setup';
import { createDeck, shuffleDeck } from '../src/rules/deck';
import type { Card } from '../src/types/card';

describe('dealCards', () => {
  it('deals 7 cards to each player from the deck', () => {
    const deck = shuffleDeck(createDeck());
    const playerIds = ['p1', 'p2', 'p3'];
    const result = dealCards(deck, playerIds, 7);

    expect(result.hands['p1']).toHaveLength(7);
    expect(result.hands['p2']).toHaveLength(7);
    expect(result.hands['p3']).toHaveLength(7);
    expect(result.remainingDeck).toHaveLength(108 - 21);
  });

  it('does not share cards between players', () => {
    const deck = shuffleDeck(createDeck());
    const playerIds = ['p1', 'p2'];
    const result = dealCards(deck, playerIds, 7);

    const p1Ids = new Set(result.hands['p1']!.map(c => c.id));
    const p2Ids = new Set(result.hands['p2']!.map(c => c.id));
    for (const id of p1Ids) {
      expect(p2Ids.has(id)).toBe(false);
    }
  });
});

describe('handleFirstDiscard', () => {
  it('accepts a number card as first discard', () => {
    const numberCard: Card = { id: 'n1', type: 'number', color: 'red', value: 5 };
    const deck = [numberCard, { id: 'n2', type: 'number', color: 'blue', value: 3 } as Card];

    const result = handleFirstDiscard(deck);

    expect(result.topCard.id).toBe('n1');
    expect(result.remainingDeck).toHaveLength(1);
    expect(result.effect).toBeNull();
  });

  it('applies skip effect for first skip card', () => {
    const skipC: Card = { id: 's1', type: 'skip', color: 'green' };
    const deck = [skipC];

    const result = handleFirstDiscard(deck);
    expect(result.effect).toEqual({ type: 'skip' });
  });

  it('applies reverse effect for first reverse card', () => {
    const revCard: Card = { id: 'r1', type: 'reverse', color: 'blue' };
    const deck = [revCard];

    const result = handleFirstDiscard(deck);
    expect(result.effect).toEqual({ type: 'reverse' });
  });

  it('applies draw_two effect for first draw_two card', () => {
    const dt: Card = { id: 'd1', type: 'draw_two', color: 'yellow' };
    const deck = [dt];

    const result = handleFirstDiscard(deck);
    expect(result.effect).toEqual({ type: 'draw_two' });
  });

  it('applies choose_color effect for first wild card', () => {
    const w: Card = { id: 'w1', type: 'wild', color: null };
    const deck = [w];

    const result = handleFirstDiscard(deck);
    expect(result.effect).toEqual({ type: 'choose_color' });
  });

  it('redraws if first card is wild_draw_four', () => {
    const wd4: Card = { id: 'wd1', type: 'wild_draw_four', color: null };
    const number: Card = { id: 'n1', type: 'number', color: 'red', value: 2 };
    const deck = [wd4, number];

    const result = handleFirstDiscard(deck);
    expect(result.topCard.id).toBe('n1');
    expect(result.effect).toBeNull();
  });
});

describe('initializeGame', () => {
  it('creates a complete initial game state', () => {
    const playerData = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Carol' },
    ];

    const state = initializeGame(playerData);

    expect(state.phase === 'playing' || state.phase === 'choosing_color').toBe(true);
    expect(state.players).toHaveLength(3);
    expect(state.players[0]!.hand.length).toBeGreaterThanOrEqual(7);
    expect(state.discardPile.length).toBeGreaterThanOrEqual(1);
    expect(state.currentColor).not.toBeUndefined();
    expect(state.deckLeft.length + state.deckRight.length).toBeGreaterThan(0);
    expect(state.roundNumber).toBe(1);
  });

  it('handles first card effects', () => {
    for (let i = 0; i < 50; i++) {
      const playerData = [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
      ];
      const state = initializeGame(playerData);
      expect(state.phase === 'playing' || state.phase === 'choosing_color').toBe(true);
      expect(state.discardPile.length).toBeGreaterThanOrEqual(1);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { createDeck, shuffleDeck, reshuffleDiscardIntoDeck } from '../src/rules/deck.js';
import type { Card } from '../src/types/card.js';

describe('createDeck', () => {
  it('creates a deck of 108 cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(108);
  });

  it('has 4 zero cards (one per color)', () => {
    const deck = createDeck();
    const zeros = deck.filter(c => c.type === 'number' && c.value === 0);
    expect(zeros).toHaveLength(4);
  });

  it('has 72 number cards (1-9, two per color)', () => {
    const deck = createDeck();
    const nonZeroNumbers = deck.filter(c => c.type === 'number' && c.value > 0);
    expect(nonZeroNumbers).toHaveLength(72);
  });

  it('has 8 skip cards (two per color)', () => {
    const deck = createDeck();
    const skips = deck.filter(c => c.type === 'skip');
    expect(skips).toHaveLength(8);
  });

  it('has 8 reverse cards (two per color)', () => {
    const deck = createDeck();
    const reverses = deck.filter(c => c.type === 'reverse');
    expect(reverses).toHaveLength(8);
  });

  it('has 8 draw two cards (two per color)', () => {
    const deck = createDeck();
    const drawTwos = deck.filter(c => c.type === 'draw_two');
    expect(drawTwos).toHaveLength(8);
  });

  it('has 4 wild cards', () => {
    const deck = createDeck();
    const wilds = deck.filter(c => c.type === 'wild');
    expect(wilds).toHaveLength(4);
  });

  it('has 4 wild draw four cards', () => {
    const deck = createDeck();
    const wildDrawFours = deck.filter(c => c.type === 'wild_draw_four');
    expect(wildDrawFours).toHaveLength(4);
  });

  it('assigns unique ids to all cards', () => {
    const deck = createDeck();
    const ids = new Set(deck.map(c => c.id));
    expect(ids.size).toBe(108);
  });
});

describe('shuffleDeck', () => {
  it('returns the same number of cards', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled).toHaveLength(108);
  });

  it('does not mutate the original deck', () => {
    const deck = createDeck();
    const original = [...deck];
    shuffleDeck(deck);
    expect(deck).toEqual(original);
  });

  it('contains the same cards', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    const originalIds = deck.map(c => c.id).sort();
    const shuffledIds = shuffled.map(c => c.id).sort();
    expect(shuffledIds).toEqual(originalIds);
  });
});

describe('reshuffleDiscardIntoDeck', () => {
  it('keeps the top card in discard and moves rest to deck', () => {
    const topCard: Card = { id: 'top', type: 'number', color: 'red', value: 5 };
    const otherCards: Card[] = [
      { id: 'a', type: 'number', color: 'blue', value: 3 },
      { id: 'b', type: 'skip', color: 'green' },
    ];
    const discardPile = [...otherCards, topCard];
    const emptyDeck: Card[] = [];

    const result = reshuffleDiscardIntoDeck(emptyDeck, discardPile);

    expect(result.discardPile).toHaveLength(1);
    expect(result.discardPile[0]!.id).toBe('top');
    expect(result.deck).toHaveLength(2);
  });

  it('clears chosenColor from wild cards when reshuffled', () => {
    const topCard: Card = { id: 'top', type: 'number', color: 'red', value: 1 };
    const wildCard: Card = { id: 'w1', type: 'wild', color: null, chosenColor: 'blue' };
    const discardPile = [wildCard, topCard];

    const result = reshuffleDiscardIntoDeck([], discardPile);

    const reshuffledWild = result.deck.find(c => c.id === 'w1');
    expect(reshuffledWild).toBeDefined();
    expect(reshuffledWild!.type).toBe('wild');
    if (reshuffledWild!.type === 'wild') {
      expect(reshuffledWild!.chosenColor).toBeUndefined();
    }
  });
});

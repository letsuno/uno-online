import { describe, it, expect } from 'vitest';
import { createDeck, serializeDeck, cardToIdentity } from '../src/rules/deck';
import type { Card } from '../src/types/card';

describe('cardToIdentity', () => {
  it('strips id from number card', () => {
    const card: Card = { id: 'card_1', type: 'number', color: 'red', value: 5 };
    expect(cardToIdentity(card)).toEqual({ color: 'red', type: 'number', value: 5 });
  });

  it('strips id from wild card', () => {
    const card: Card = { id: 'card_99', type: 'wild', color: null };
    expect(cardToIdentity(card)).toEqual({ color: null, type: 'wild' });
  });

  it('strips id and chosenColor from wild card', () => {
    const card: Card = { id: 'card_99', type: 'wild', color: null, chosenColor: 'blue' };
    expect(cardToIdentity(card)).toEqual({ color: null, type: 'wild' });
  });

  it('strips id from skip card', () => {
    const card: Card = { id: 'card_50', type: 'skip', color: 'green' };
    expect(cardToIdentity(card)).toEqual({ color: 'green', type: 'skip' });
  });
});

describe('serializeDeck', () => {
  it('produces deterministic JSON for the same deck', () => {
    const deck = createDeck();
    const s1 = serializeDeck(deck);
    const s2 = serializeDeck(deck);
    expect(s1).toBe(s2);
  });

  it('produces valid JSON', () => {
    const deck = createDeck();
    const serialized = serializeDeck(deck);
    const parsed = JSON.parse(serialized);
    expect(parsed).toHaveLength(108);
  });

  it('does not contain card ids', () => {
    const deck = createDeck();
    const serialized = serializeDeck(deck);
    expect(serialized).not.toContain('card_');
  });

  it('produces different output for different orderings', () => {
    const deck = createDeck();
    const reversed = [...deck].reverse();
    expect(serializeDeck(deck)).not.toBe(serializeDeck(reversed));
  });
});

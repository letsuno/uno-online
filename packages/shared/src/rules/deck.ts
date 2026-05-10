import type { Card } from '../types/card';
import { COLORS } from '../constants/deck';

let cardIdCounter = 0;

function nextId(): string {
  return `card_${++cardIdCounter}`;
}

export function resetCardIdCounter(): void {
  cardIdCounter = 0;
}

export function createDeck(): Card[] {
  resetCardIdCounter();
  const cards: Card[] = [];

  for (const color of COLORS) {
    cards.push({ id: nextId(), type: 'number', color, value: 0 });

    for (let value = 1; value <= 9; value++) {
      cards.push({ id: nextId(), type: 'number', color, value });
      cards.push({ id: nextId(), type: 'number', color, value });
    }

    for (let i = 0; i < 2; i++) {
      cards.push({ id: nextId(), type: 'skip', color });
      cards.push({ id: nextId(), type: 'reverse', color });
      cards.push({ id: nextId(), type: 'draw_two', color });
    }
  }

  for (let i = 0; i < 4; i++) {
    cards.push({ id: nextId(), type: 'wild', color: null });
    cards.push({ id: nextId(), type: 'wild_draw_four', color: null });
  }

  return cards;
}

export function shuffleDeck(deck: readonly Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

function clearWildColor(card: Card): Card {
  if (card.type === 'wild') {
    return { id: card.id, type: 'wild', color: null };
  }
  if (card.type === 'wild_draw_four') {
    return { id: card.id, type: 'wild_draw_four', color: null };
  }
  return card;
}

export function reshuffleDiscardIntoDeck(
  currentDeck: readonly Card[],
  discardPile: readonly Card[],
): { deck: Card[]; discardPile: Card[] } {
  if (discardPile.length <= 1) {
    return { deck: [...currentDeck], discardPile: [...discardPile] };
  }

  const topCard = discardPile[discardPile.length - 1]!;
  const cardsToReshuffle = discardPile.slice(0, -1).map(clearWildColor);
  const newDeck = shuffleDeck([...currentDeck, ...cardsToReshuffle]);

  return { deck: newDeck, discardPile: [topCard] };
}

export function reshuffleSideFromDiscard(
  currentSideDeck: readonly Card[],
  discardPile: readonly Card[],
  targetCount: number,
): { sideDeck: Card[]; discardPile: Card[] } {
  if (discardPile.length <= 1) {
    return { sideDeck: [...currentSideDeck], discardPile: [...discardPile] };
  }

  const topCard = discardPile[discardPile.length - 1]!;
  const available = discardPile.slice(0, -1);
  const takeCount = Math.min(targetCount, available.length);
  const cardsToReshuffle = available.slice(0, takeCount).map(clearWildColor);
  const remainingDiscard = available.slice(takeCount);

  const newSideDeck = shuffleDeck([...currentSideDeck, ...cardsToReshuffle]);
  return { sideDeck: newSideDeck, discardPile: [...remainingDiscard, topCard] };
}

export interface CardIdentity {
  color: Card['color'];
  type: Card['type'];
  value?: number;
}

export function cardToIdentity(card: Card): CardIdentity {
  const identity: CardIdentity = { color: card.color, type: card.type };
  if (card.type === 'number') {
    identity.value = card.value;
  }
  return identity;
}

export function serializeDeck(deck: readonly Card[]): string {
  return JSON.stringify(deck.map(cardToIdentity));
}

export function serializeDecks(deckLeft: readonly Card[], deckRight: readonly Card[]): string {
  return JSON.stringify([...deckLeft, ...deckRight].map(cardToIdentity));
}

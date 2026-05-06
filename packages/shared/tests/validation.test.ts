import { describe, it, expect } from 'vitest';
import { canPlayCard, getPlayableCards, isValidWildDrawFour } from '../src/rules/validation';
import type { Card, Color } from '../src/types/card';

function numberCard(color: Color, value: number, id = 'c1'): Card {
  return { id, type: 'number', color, value };
}

function skipCard(color: Color, id = 'c1'): Card {
  return { id, type: 'skip', color };
}

function reverseCard(color: Color, id = 'c1'): Card {
  return { id, type: 'reverse', color };
}

function drawTwoCard(color: Color, id = 'c1'): Card {
  return { id, type: 'draw_two', color };
}

function wildCard(id = 'c1'): Card {
  return { id, type: 'wild', color: null };
}

function wildDrawFour(id = 'c1'): Card {
  return { id, type: 'wild_draw_four', color: null };
}

describe('canPlayCard', () => {
  it('allows matching color', () => {
    const topCard = numberCard('red', 3);
    const playCard = numberCard('red', 7, 'c2');
    expect(canPlayCard(playCard, topCard, 'red')).toBe(true);
  });

  it('allows matching number', () => {
    const topCard = numberCard('red', 3);
    const playCard = numberCard('blue', 3, 'c2');
    expect(canPlayCard(playCard, topCard, 'red')).toBe(true);
  });

  it('rejects non-matching card', () => {
    const topCard = numberCard('red', 3);
    const playCard = numberCard('blue', 7, 'c2');
    expect(canPlayCard(playCard, topCard, 'red')).toBe(false);
  });

  it('allows wild card on anything', () => {
    const topCard = numberCard('red', 3);
    expect(canPlayCard(wildCard(), topCard, 'red')).toBe(true);
  });

  it('allows wild draw four on anything', () => {
    const topCard = numberCard('red', 3);
    expect(canPlayCard(wildDrawFour(), topCard, 'red')).toBe(true);
  });

  it('allows skip on matching color', () => {
    const topCard = numberCard('green', 5);
    expect(canPlayCard(skipCard('green'), topCard, 'green')).toBe(true);
  });

  it('allows skip on skip of different color', () => {
    const topCard = skipCard('red');
    expect(canPlayCard(skipCard('blue', 'c2'), topCard, 'red')).toBe(true);
  });

  it('uses currentColor for wild top cards', () => {
    const topCard: Card = { id: 'w', type: 'wild', color: null, chosenColor: 'yellow' };
    const playCard = numberCard('yellow', 5);
    expect(canPlayCard(playCard, topCard, 'yellow')).toBe(true);
  });

  it('rejects wrong color against wild chosen color', () => {
    const topCard: Card = { id: 'w', type: 'wild', color: null, chosenColor: 'yellow' };
    const playCard = numberCard('red', 5);
    expect(canPlayCard(playCard, topCard, 'yellow')).toBe(false);
  });

  it('allows draw_two on draw_two of different color (matching type)', () => {
    const topCard = drawTwoCard('red');
    expect(canPlayCard(drawTwoCard('blue', 'c2'), topCard, 'red')).toBe(true);
  });

  it('allows reverse on reverse of different color (matching type)', () => {
    const topCard = reverseCard('red');
    expect(canPlayCard(reverseCard('green', 'c2'), topCard, 'red')).toBe(true);
  });
});

describe('getPlayableCards', () => {
  it('returns all playable cards from hand', () => {
    const topCard = numberCard('red', 5);
    const hand: Card[] = [
      numberCard('red', 2, 'h1'),
      numberCard('blue', 5, 'h2'),
      numberCard('green', 8, 'h3'),
      wildCard('h4'),
    ];
    const playable = getPlayableCards(hand, topCard, 'red');
    expect(playable.map(c => c.id).sort()).toEqual(['h1', 'h2', 'h4']);
  });

  it('returns empty when nothing is playable except wilds are always playable', () => {
    const topCard = numberCard('red', 5);
    const hand: Card[] = [
      numberCard('blue', 3, 'h1'),
      numberCard('green', 8, 'h2'),
    ];
    const playable = getPlayableCards(hand, topCard, 'red');
    expect(playable).toHaveLength(0);
  });
});

describe('isValidWildDrawFour', () => {
  it('is valid when player has no cards matching current color', () => {
    const hand: Card[] = [
      numberCard('blue', 3, 'h1'),
      numberCard('green', 7, 'h2'),
      wildDrawFour('h3'),
    ];
    expect(isValidWildDrawFour(hand, 'red')).toBe(true);
  });

  it('is invalid when player has cards matching current color', () => {
    const hand: Card[] = [
      numberCard('red', 3, 'h1'),
      numberCard('green', 7, 'h2'),
      wildDrawFour('h3'),
    ];
    expect(isValidWildDrawFour(hand, 'red')).toBe(false);
  });

  it('ignores other wild cards when checking', () => {
    const hand: Card[] = [
      wildCard('h1'),
      wildDrawFour('h2'),
    ];
    expect(isValidWildDrawFour(hand, 'red')).toBe(true);
  });
});

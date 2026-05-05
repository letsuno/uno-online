import { describe, it, expect } from 'vitest';
import { applyActionWithHouseRules } from '../src/rules/house-rules-engine.js';
import type { GameState } from '../src/types/game.js';
import type { Card, Color } from '../src/types/card.js';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules.js';

function makeCard(type: Card['type'], color: Color | null, extra?: { value?: number; id?: string }): Card {
  const id = extra?.id ?? `card_${Math.random().toString(36).slice(2, 8)}`;
  switch (type) {
    case 'number': return { id, type, color: color as Color, value: extra?.value ?? 0 };
    case 'skip': return { id, type, color: color as Color };
    case 'reverse': return { id, type, color: color as Color };
    case 'draw_two': return { id, type, color: color as Color };
    case 'wild': return { id, type, color: null };
    case 'wild_draw_four': return { id, type, color: null };
  }
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'playing', players: [
      { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, calledUno: false },
      { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, calledUno: false },
    ],
    currentPlayerIndex: 0, direction: 'clockwise',
    deck: Array.from({ length: 20 }, (_, i) => makeCard('number', 'blue', { value: i % 10, id: `deck_${i}` })),
    discardPile: [makeCard('number', 'red', { value: 5, id: 'discard_top' })],
    currentColor: 'red', drawStack: 0, pendingDrawPlayerId: null, lastAction: null,
    roundNumber: 1, winnerId: null,
    settings: { turnTimeLimit: 30, targetScore: 500, houseRules: DEFAULT_HOUSE_RULES },
    ...overrides,
  };
}

describe('mode rules: no regression', () => {
  it('deathDraw enabled does not break standard play', () => {
    const card = makeCard('number', 'red', { value: 7, id: 'play1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card, makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, deathDraw: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'play1' });
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('elimination enabled does not break standard play', () => {
    const card = makeCard('number', 'red', { value: 7, id: 'play1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card, makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, elimination: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'play1' });
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('teamMode enabled does not break standard play', () => {
    const card = makeCard('number', 'red', { value: 7, id: 'play1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card, makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, teamMode: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'play1' });
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('revengeMode enabled does not break standard play', () => {
    const card = makeCard('number', 'red', { value: 7, id: 'play1' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [card, makeCard('number', 'blue', { value: 1 })], score: 0, connected: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'green', { value: 1 })], score: 0, connected: true, calledUno: false },
      ],
      settings: { turnTimeLimit: 30, targetScore: 500, houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true } },
    });
    const next = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'play1' });
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('blindDraw flag exists in DEFAULT_HOUSE_RULES and is false by default', () => {
    expect(DEFAULT_HOUSE_RULES.blindDraw).toBe(false);
  });

  it('blitzTimeLimit is null by default', () => {
    expect(DEFAULT_HOUSE_RULES.blitzTimeLimit).toBeNull();
  });

  it('bombCard flag exists and is false by default', () => {
    expect(DEFAULT_HOUSE_RULES.bombCard).toBe(false);
  });

  it('deathDraw flag exists and is false by default', () => {
    expect(DEFAULT_HOUSE_RULES.deathDraw).toBe(false);
  });
});

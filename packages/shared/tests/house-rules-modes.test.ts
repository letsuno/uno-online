import { describe, it, expect } from 'vitest';
import { applyActionWithHouseRules } from '../src/rules/house-rules-engine';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules';
import { makeCard, makeState } from './helpers/test-utils';

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

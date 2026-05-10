import { describe, expect, it } from 'vitest';
import { DEFAULT_HOUSE_RULES, chooseAutopilotAction } from '../src';
import type { Card, Color, GameState } from '../src';

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
  const defaults: GameState = {
    phase: 'playing',
    players: [
      { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, autopilot: true, calledUno: false },
      { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
    ],
    currentPlayerIndex: 0,
    direction: 'clockwise',
    deckLeft: [],
    deckRight: [],
    deckLeftInitialCount: 0,
    deckRightInitialCount: 0,
    discardPile: [makeCard('number', 'red', { value: 5, id: 'top' })],
    currentColor: 'red',
    drawStack: 0,
    pendingDrawPlayerId: null,
    lastAction: null,
    roundNumber: 1,
    winnerId: null,
    deckHash: '',
    settings: {
      turnTimeLimit: 30,
      targetScore: 500,
      allowSpectators: true,
      spectatorMode: 'hidden',
      houseRules: DEFAULT_HOUSE_RULES,
    },
  };
  return { ...defaults, ...overrides };
}

describe('chooseAutopilotAction after drawing', () => {
  it('plays a playable drawn card instead of passing', () => {
    const drawn = makeCard('number', 'red', { value: 9, id: 'drawn_red_9' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [drawn], score: 0, connected: true, autopilot: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
      ],
      lastAction: { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const },
    });

    expect(chooseAutopilotAction(state, 'p1')).toEqual([
      { type: 'PLAY_CARD', playerId: 'p1', cardId: 'drawn_red_9' },
    ]);
  });

  it('chooses a color when the playable drawn card is wild', () => {
    const wild = makeCard('wild', null, { id: 'drawn_wild' });
    const blue = makeCard('number', 'blue', { value: 2, id: 'blue_2' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [wild, blue], score: 0, connected: true, autopilot: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
      ],
      lastAction: { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const },
    });

    expect(chooseAutopilotAction(state, 'p1')).toEqual([
      { type: 'PLAY_CARD', playerId: 'p1', cardId: 'drawn_wild' },
      { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'blue' },
    ]);
  });

  it('passes when no card is playable after drawing', () => {
    const drawn = makeCard('number', 'blue', { value: 9, id: 'drawn_blue_9' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [drawn], score: 0, connected: true, autopilot: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
      ],
      lastAction: { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const },
    });

    expect(chooseAutopilotAction(state, 'p1')).toEqual([
      { type: 'PASS', playerId: 'p1' },
    ]);
  });

  it('keeps drawing after drawing an unplayable card in draw-until-playable mode', () => {
    const drawn = makeCard('number', 'blue', { value: 9, id: 'drawn_blue_9' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [drawn], score: 0, connected: true, autopilot: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
      ],
      deckLeft: [makeCard('number', 'green', { value: 3, id: 'deck1' })],
      deckLeftInitialCount: 1,
      lastAction: { type: 'DRAW_CARD', playerId: 'p1', side: 'left' as const },
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, drawUntilPlayable: true },
      },
    });

    const result = chooseAutopilotAction(state, 'p1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'DRAW_CARD', playerId: 'p1' });
  });
});

describe('chooseAutopilotAction for seven swap', () => {
  it('chooses the player with the fewest cards as the swap target', () => {
    const state = makeState({
      phase: 'choosing_swap_target',
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [makeCard('number', 'red', { value: 1, id: 'p1c1' })],
          score: 0,
          connected: true,
          autopilot: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [
            makeCard('number', 'blue', { value: 1, id: 'p2c1' }),
            makeCard('number', 'blue', { value: 2, id: 'p2c2' }),
            makeCard('number', 'blue', { value: 3, id: 'p2c3' }),
          ],
          score: 0,
          connected: true,
          autopilot: false,
          calledUno: false,
        },
        {
          id: 'p3',
          name: 'Carol',
          hand: [makeCard('number', 'green', { value: 1, id: 'p3c1' })],
          score: 0,
          connected: true,
          autopilot: false,
          calledUno: false,
        },
      ],
    });

    expect(chooseAutopilotAction(state, 'p1')).toEqual([
      { type: 'CHOOSE_SWAP_TARGET', playerId: 'p1', targetId: 'p3' },
    ]);
  });
});

describe('chooseAutopilotAction for seven swap', () => {
  it('chooses the player with the fewest cards as the swap target', () => {
    const state = makeState({
      phase: 'choosing_swap_target',
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [makeCard('number', 'red', { value: 1, id: 'p1c1' })],
          score: 0,
          connected: true,
          autopilot: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [
            makeCard('number', 'blue', { value: 1, id: 'p2c1' }),
            makeCard('number', 'blue', { value: 2, id: 'p2c2' }),
            makeCard('number', 'blue', { value: 3, id: 'p2c3' }),
          ],
          score: 0,
          connected: true,
          autopilot: false,
          calledUno: false,
        },
        {
          id: 'p3',
          name: 'Carol',
          hand: [makeCard('number', 'green', { value: 1, id: 'p3c1' })],
          score: 0,
          connected: true,
          autopilot: false,
          calledUno: false,
        },
      ],
    });

    expect(chooseAutopilotAction(state, 'p1')).toEqual([
      { type: 'CHOOSE_SWAP_TARGET', playerId: 'p1', targetId: 'p3' },
    ]);
  });
});

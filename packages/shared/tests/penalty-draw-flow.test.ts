import { describe, expect, it } from 'vitest';
import { DEFAULT_HOUSE_RULES, applyAction } from '../src';
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
      { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
      { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
      { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
    ],
    currentPlayerIndex: 0,
    direction: 'clockwise',
    deck: [],
    discardPile: [makeCard('number', 'red', { value: 5, id: 'top' })],
    currentColor: 'red',
    drawStack: 0,
    pendingDrawPlayerId: null,
    pendingPenaltyDraws: 0,
    pendingPenaltyNextPlayerIndex: null,
    pendingPenaltySourcePlayerId: null,
    pendingPenaltyQueue: [],
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

describe('penalty draw flow', () => {
  it('queues draw_two penalty and resolves it one drawn card at a time', () => {
    const drawTwo = makeCard('draw_two', 'red', { id: 'd2' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [drawTwo, makeCard('number', 'blue', { value: 1, id: 'p1b' })], score: 0, connected: true, autopilot: false, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
      ],
      deck: [
        makeCard('number', 'green', { value: 1, id: 'draw1' }),
        makeCard('number', 'yellow', { value: 2, id: 'draw2' }),
      ],
    });

    const afterPlay = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd2' });
    expect(afterPlay.players[1]!.hand).toHaveLength(0);
    expect(afterPlay.currentPlayerIndex).toBe(1);
    expect(afterPlay.pendingPenaltyDraws).toBe(2);

    const afterFirstDraw = applyAction(afterPlay, { type: 'DRAW_CARD', playerId: 'p2' });
    expect(afterFirstDraw.players[1]!.hand.map(c => c.id)).toEqual(['draw1']);
    expect(afterFirstDraw.currentPlayerIndex).toBe(1);
    expect(afterFirstDraw.pendingPenaltyDraws).toBe(1);

    const afterSecondDraw = applyAction(afterFirstDraw, { type: 'DRAW_CARD', playerId: 'p2' });
    expect(afterSecondDraw.players[1]!.hand.map(c => c.id)).toEqual(['draw1', 'draw2']);
    expect(afterSecondDraw.currentPlayerIndex).toBe(2);
    expect(afterSecondDraw.pendingPenaltyDraws).toBe(0);
  });

  it('checks round end only after the queued penalty has been paid', () => {
    const drawTwo = makeCard('draw_two', 'red', { id: 'last_d2' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [drawTwo], score: 0, connected: true, autopilot: false, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, autopilot: false, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 1, id: 'p3c' })], score: 0, connected: true, autopilot: false, calledUno: false },
      ],
      deck: [
        makeCard('number', 'green', { value: 2, id: 'draw1' }),
        makeCard('number', 'yellow', { value: 3, id: 'draw2' }),
      ],
    });

    const afterPlay = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'last_d2' });
    expect(afterPlay.phase).toBe('playing');
    expect(afterPlay.pendingPenaltySourcePlayerId).toBe('p1');

    const afterFirstDraw = applyAction(afterPlay, { type: 'DRAW_CARD', playerId: 'p2' });
    expect(afterFirstDraw.phase).toBe('playing');

    const afterSecondDraw = applyAction(afterFirstDraw, { type: 'DRAW_CARD', playerId: 'p2' });
    expect(afterSecondDraw.phase).toBe('round_end');
    expect(afterSecondDraw.winnerId).toBe('p1');
  });
});

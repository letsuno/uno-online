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
    deckLeft: [],
    deckRight: [],
    deckLeftInitialCount: 0,
    deckRightInitialCount: 0,
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
      deckLeft: [
        makeCard('number', 'green', { value: 1, id: 'draw1' }),
        makeCard('number', 'yellow', { value: 2, id: 'draw2' }),
      ],
      deckRight: [],
      deckLeftInitialCount: 2,
      deckRightInitialCount: 0,
    });

    const afterPlay = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd2' });
    expect(afterPlay.players[1]!.hand).toHaveLength(0);
    expect(afterPlay.currentPlayerIndex).toBe(1);
    expect(afterPlay.pendingPenaltyDraws).toBe(2);

    const afterFirstDraw = applyAction(afterPlay, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' as const });
    expect(afterFirstDraw.players[1]!.hand.map(c => c.id)).toEqual(['draw1']);
    expect(afterFirstDraw.currentPlayerIndex).toBe(1);
    expect(afterFirstDraw.pendingPenaltyDraws).toBe(1);

    const afterSecondDraw = applyAction(afterFirstDraw, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' as const });
    expect(afterSecondDraw.players[1]!.hand.map(c => c.id)).toEqual(['draw1', 'draw2']);
    expect(afterSecondDraw.currentPlayerIndex).toBe(2);
    expect(afterSecondDraw.pendingPenaltyDraws).toBe(0);
  });

  it('does not allow playing or passing until all pending penalty cards are drawn', () => {
    const playableDrawn = makeCard('number', 'red', { value: 7, id: 'drawn_red' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
      ],
      currentPlayerIndex: 1,
      pendingPenaltyDraws: 8,
      pendingPenaltyNextPlayerIndex: 2,
      pendingPenaltySourcePlayerId: 'p1',
      deckLeft: [
        playableDrawn,
        makeCard('number', 'blue', { value: 1, id: 'draw2' }),
      ],
      deckRight: [],
      deckLeftInitialCount: 2,
      deckRightInitialCount: 0,
    });

    const afterFirstDraw = applyAction(state, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' as const });
    expect(afterFirstDraw.players[1]!.hand.map(c => c.id)).toEqual(['drawn_red']);
    expect(afterFirstDraw.pendingPenaltyDraws).toBe(7);
    expect(afterFirstDraw.currentPlayerIndex).toBe(1);

    const afterIllegalPlay = applyAction(afterFirstDraw, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'drawn_red' });
    expect(afterIllegalPlay).toStrictEqual(afterFirstDraw);

    const afterIllegalPass = applyAction(afterFirstDraw, { type: 'PASS', playerId: 'p2' });
    expect(afterIllegalPass).toStrictEqual(afterFirstDraw);
  });

  it('requires all 4 wild draw four penalty cards to be drawn after accepting', () => {
    const deckCards = Array.from({ length: 6 }, (_, i) => makeCard('number', 'blue', { value: i, id: `wd4_draw_${i}` }));
    const state = makeState({
      phase: 'challenging',
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
      ],
      currentPlayerIndex: 0,
      pendingDrawPlayerId: 'p2',
      deckLeft: deckCards,
      deckRight: [],
      deckLeftInitialCount: 6,
      deckRightInitialCount: 0,
      discardPile: [makeCard('wild_draw_four', null, { id: 'wd4' })],
    });

    let next = applyAction(state, { type: 'ACCEPT', playerId: 'p2' });
    expect(next.pendingPenaltyDraws).toBe(4);

    for (let expectedRemaining = 3; expectedRemaining >= 0; expectedRemaining--) {
      next = applyAction(next, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' as const });
      expect(next.pendingPenaltyDraws).toBe(expectedRemaining);
    }

    expect(next.players[1]!.hand.map(c => c.id)).toEqual([
      'wd4_draw_0',
      'wd4_draw_1',
      'wd4_draw_2',
      'wd4_draw_3',
    ]);
    expect(next.currentPlayerIndex).toBe(2);
  });

  it('does not allow a caught UNO player to call UNO before the catch penalty is paid', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
        {
          id: 'p2',
          name: 'Bob',
          hand: [makeCard('number', 'red', { value: 5, id: 'p2_last' })],
          score: 0,
          connected: true,
          autopilot: false,
          calledUno: false,
        },
        { id: 'p3', name: 'Carol', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
      ],
      deckLeft: [
        makeCard('number', 'blue', { value: 1, id: 'catch_draw_1' }),
        makeCard('number', 'green', { value: 2, id: 'catch_draw_2' }),
      ],
      deckRight: [],
      deckLeftInitialCount: 2,
      deckRightInitialCount: 0,
    });

    const caught = applyAction(state, { type: 'CATCH_UNO', catcherId: 'p1', targetId: 'p2' });
    expect(caught.players[1]!.unoCaught).toBe(true);
    expect(caught.pendingPenaltyDraws).toBe(2);

    const immediateCall = applyAction(caught, { type: 'CALL_UNO', playerId: 'p2' });
    expect(immediateCall).toStrictEqual(caught);

    const afterFirstDraw = applyAction(caught, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' as const });
    expect(afterFirstDraw.pendingPenaltyDraws).toBe(1);
    expect(afterFirstDraw.players[1]!.unoCaught).toBe(false);

    const callDuringPenalty = applyAction(afterFirstDraw, { type: 'CALL_UNO', playerId: 'p2' });
    expect(callDuringPenalty).toStrictEqual(afterFirstDraw);
  });

  it('ends round immediately when last card is draw_two', () => {
    const drawTwo = makeCard('draw_two', 'red', { id: 'last_d2' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [drawTwo], score: 0, connected: true, autopilot: false, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'blue', { value: 1, id: 'p2c' })], score: 0, connected: true, autopilot: false, calledUno: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 1, id: 'p3c' })], score: 0, connected: true, autopilot: false, calledUno: false },
      ],
      deckLeft: [
        makeCard('number', 'green', { value: 2, id: 'draw1' }),
        makeCard('number', 'yellow', { value: 3, id: 'draw2' }),
      ],
      deckRight: [],
      deckLeftInitialCount: 2,
      deckRightInitialCount: 0,
    });

    const afterPlay = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'last_d2' });
    expect(afterPlay.phase).toBe('round_end');
    expect(afterPlay.winnerId).toBe('p1');
  });
});

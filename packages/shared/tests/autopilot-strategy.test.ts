import { describe, expect, it } from 'vitest';
import { DEFAULT_HOUSE_RULES, chooseAutopilotAction, chooseAutopilotJumpInAction } from '../src';
import { makeCard, makeState } from './helpers/test-utils';

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

describe('chooseAutopilotAction with wild_draw_four and stacking', () => {
  it('includes chosenColor when stacking on existing drawStack', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4' });
    const state = makeState({
      drawStack: 4,
      discardPile: [makeCard('number', 'red', { value: 1, id: 'base' }), makeCard('wild_draw_four', null, { id: 'top_wd4' })],
      players: [
        { id: 'p1', name: 'Alice', hand: [wd4], score: 0, connected: true, autopilot: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'red', { value: 1, id: 'r1' })], score: 0, connected: true, autopilot: false, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, stackDrawFour: true },
      },
    });

    const actions = chooseAutopilotAction(state, 'p1');
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'wd4',
      chosenColor: expect.any(String),
    });
  });

  it('uses two-step flow for first +4 even when stacking is enabled', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4' });
    const state = makeState({
      drawStack: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [wd4], score: 0, connected: true, autopilot: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'red', { value: 1, id: 'r1' })], score: 0, connected: true, autopilot: false, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, stackDrawFour: true },
      },
    });

    const actions = chooseAutopilotAction(state, 'p1');
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4' });
    expect(actions[0]).not.toHaveProperty('chosenColor');
    expect(actions[1]).toMatchObject({ type: 'CHOOSE_COLOR', playerId: 'p1' });
  });

  it('uses two-step PLAY_CARD + CHOOSE_COLOR when stacking is disabled', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4' });
    const blue = makeCard('number', 'blue', { value: 3, id: 'blue_3' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [wd4, blue], score: 0, connected: true, autopilot: true, calledUno: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'red', { value: 1, id: 'r1' })], score: 0, connected: true, autopilot: false, calledUno: false },
      ],
    });

    const actions = chooseAutopilotAction(state, 'p1');
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4' });
    expect(actions[0]).not.toHaveProperty('chosenColor');
    expect(actions[1]).toMatchObject({ type: 'CHOOSE_COLOR', playerId: 'p1', color: 'blue' });
  });
});

describe('chooseAutopilotJumpInAction', () => {
  it('plays an exact matching card while another player has the turn', () => {
    const jumpCard = makeCard('number', 'red', { value: 5, id: 'jump_red_5' });
    const state = makeState({
      currentPlayerIndex: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
        { id: 'p2', name: 'Bot', hand: [jumpCard], score: 0, connected: true, autopilot: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, jumpIn: true },
      },
    });

    expect(chooseAutopilotJumpInAction(state, 'p2')).toEqual([
      { type: 'PLAY_CARD', playerId: 'p2', cardId: 'jump_red_5' },
    ]);
  });

  it('does not jump in without an exact match', () => {
    const state = makeState({
      currentPlayerIndex: 0,
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
        {
          id: 'p2',
          name: 'Bot',
          hand: [makeCard('number', 'red', { value: 6, id: 'red_6' })],
          score: 0,
          connected: true,
          autopilot: true,
          calledUno: false,
        },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, jumpIn: true },
      },
    });

    expect(chooseAutopilotJumpInAction(state, 'p2')).toEqual([]);
  });

  it('chooses a color after jumping in with a wild card', () => {
    const jumpWild = makeCard('wild', null, { id: 'jump_wild' });
    const blue = makeCard('number', 'blue', { value: 2, id: 'blue_2' });
    const state = makeState({
      currentPlayerIndex: 0,
      discardPile: [makeCard('wild', null, { id: 'top_wild' })],
      players: [
        { id: 'p1', name: 'Alice', hand: [], score: 0, connected: true, autopilot: false, calledUno: false },
        { id: 'p2', name: 'Bot', hand: [jumpWild, blue], score: 0, connected: true, autopilot: true, calledUno: false },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, jumpIn: true },
      },
    });

    expect(chooseAutopilotJumpInAction(state, 'p2')).toEqual([
      { type: 'PLAY_CARD', playerId: 'p2', cardId: 'jump_wild' },
      { type: 'CHOOSE_COLOR', playerId: 'p2', color: 'blue' },
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

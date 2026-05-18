import { describe, expect, it } from 'vitest';
import { applyActionWithHouseRules } from '../src/rules/house-rules-engine';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules';
import { makeCard, makeState } from './helpers/test-utils';

describe('latest house rule bug fixes', () => {
  it('does not let draw-until-playable inherit a previous skip as a continuing draw turn', () => {
    const skip = makeCard('skip', 'red', { id: 'skip' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [skip, makeCard('number', 'blue', { value: 8, id: 'p1_blue' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'yellow', { value: 1, id: 'p2_yellow' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'blue', { value: 2, id: 'p3_blue' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      deckLeft: [
        makeCard('number', 'green', { value: 1, id: 'first_unplayable' }),
        makeCard('number', 'yellow', { value: 2, id: 'second_unplayable' }),
      ],
      deckRight: [],
      deckLeftInitialCount: 2,
      deckRightInitialCount: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, drawUntilPlayable: true },
      },
    });

    const afterSkip = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'skip' });
    expect(afterSkip.currentPlayerIndex).toBe(2);
    expect(afterSkip.lastAction).toMatchObject({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'skip' });

    const afterFirstDraw = applyActionWithHouseRules(afterSkip, { type: 'DRAW_CARD', playerId: 'p3', side: 'left' });
    expect(afterFirstDraw.players[2]!.hand.map(c => c.id)).toEqual(['p3_blue', 'first_unplayable']);
    expect(afterFirstDraw.deckLeft.map(c => c.id)).toEqual(['second_unplayable']);

    const afterSecondDraw = applyActionWithHouseRules(afterFirstDraw, { type: 'DRAW_CARD', playerId: 'p3', side: 'left' });
    expect(afterSecondDraw.players[2]!.hand.map(c => c.id)).toEqual(['p3_blue', 'first_unplayable', 'second_unplayable']);
  });

  it('does not auto-play the first drawn card when draw-until-playable is combined with forced draw play', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'blue', { value: 8, id: 'p1_blue' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'yellow', { value: 1, id: 'p2_yellow' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      deckLeft: [makeCard('number', 'red', { value: 8, id: 'drawn_playable' })],
      deckRight: [],
      deckLeftInitialCount: 1,
      deckRightInitialCount: 0,
      lastAction: { type: 'PLAY_CARD', playerId: 'p2', cardId: 'p2_yellow' },
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, drawUntilPlayable: true, forcedPlayAfterDraw: true },
      },
    });

    const afterDraw = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' });
    expect(afterDraw.players[0]!.hand.map(c => c.id)).toEqual(['p1_blue', 'drawn_playable']);
    expect(afterDraw.discardPile.map(c => c.id)).not.toContain('drawn_playable');
  });

  it('does not let drawUntilPlayable inherit a previous skip as a continuing draw turn', () => {
    const skip = makeCard('skip', 'red', { id: 'skip' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [skip, makeCard('number', 'blue', { value: 8, id: 'p1_blue' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'yellow', { value: 1, id: 'p2_yellow' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'blue', { value: 2, id: 'p3_blue' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      deckLeft: [
        makeCard('number', 'green', { value: 1, id: 'first_unplayable' }),
        makeCard('number', 'yellow', { value: 2, id: 'second_unplayable' }),
      ],
      deckRight: [],
      deckLeftInitialCount: 2,
      deckRightInitialCount: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, drawUntilPlayable: true },
      },
    });

    const afterSkip = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'skip' });
    const afterFirstDraw = applyActionWithHouseRules(afterSkip, { type: 'DRAW_CARD', playerId: 'p3', side: 'left' });
    expect(afterFirstDraw.players[2]!.hand.map(c => c.id)).toEqual(['p3_blue', 'first_unplayable']);
    expect(afterFirstDraw.deckLeft.map(c => c.id)).toEqual(['second_unplayable']);

    const afterSecondDraw = applyActionWithHouseRules(afterFirstDraw, { type: 'DRAW_CARD', playerId: 'p3', side: 'left' });
    expect(afterSecondDraw.players[2]!.hand.map(c => c.id)).toEqual(['p3_blue', 'first_unplayable', 'second_unplayable']);
  });

  it('does not auto-play the first drawn card when drawUntilPlayable is combined with forced draw play', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'blue', { value: 8, id: 'p1_blue' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'yellow', { value: 1, id: 'p2_yellow' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      deckLeft: [makeCard('number', 'red', { value: 8, id: 'drawn_playable' })],
      deckRight: [],
      deckLeftInitialCount: 1,
      deckRightInitialCount: 0,
      lastAction: { type: 'PLAY_CARD', playerId: 'p2', cardId: 'p2_yellow' },
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, drawUntilPlayable: true, forcedPlayAfterDraw: true },
      },
    });

    const afterDraw = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' });
    expect(afterDraw.players[0]!.hand.map(c => c.id)).toEqual(['p1_blue', 'drawn_playable']);
    expect(afterDraw.discardPile.map(c => c.id)).not.toContain('drawn_playable');
  });

  it('starts +4 penalty draws immediately after choosing color when challenges are disabled', () => {
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4' });
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [wd4, makeCard('number', 'blue', { value: 8, id: 'p1_blue' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'yellow', { value: 1, id: 'p2_yellow' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3_green' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      deckLeft: Array.from({ length: 5 }, (_, i) => makeCard('number', 'red', { value: i, id: `penalty_${i}` })),
      deckRight: [],
      deckLeftInitialCount: 5,
      deckRightInitialCount: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, noChallengeWildFour: true },
      },
    });

    const afterPlay = applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd4' });
    expect(afterPlay.phase).toBe('choosing_color');

    const afterColor = applyActionWithHouseRules(afterPlay, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'green' });
    expect(afterColor.phase).toBe('playing');
    expect(afterColor.currentColor).toBe('green');
    expect(afterColor.pendingDrawPlayerId).toBeNull();
    expect(afterColor.currentPlayerIndex).toBe(1);
    expect(afterColor.pendingPenaltyDraws).toBe(4);

    const challengeAttempt = applyActionWithHouseRules(afterColor, { type: 'CHALLENGE', playerId: 'p2' });
    expect(challengeAttempt).toBe(afterColor);

    const afterFirstPenaltyDraw = applyActionWithHouseRules(afterColor, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' });
    expect(afterFirstPenaltyDraw.pendingPenaltyDraws).toBe(3);
    expect(afterFirstPenaltyDraw.players[1]!.hand.map(c => c.id)).toEqual(['p2_yellow', 'penalty_0']);
  });

  it('still allows draw then pass when forced-play-after-draw draws an unplayable card', () => {
    const state = makeState({
      players: [
        { id: 'p1', name: 'Alice', hand: [makeCard('number', 'blue', { value: 8, id: 'p1_blue' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p2', name: 'Bob', hand: [makeCard('number', 'yellow', { value: 1, id: 'p2_yellow' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p3', name: 'Carol', hand: [makeCard('number', 'green', { value: 2, id: 'p3_green' })], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      deckLeft: [makeCard('number', 'green', { value: 9, id: 'drawn_unplayable' })],
      deckRight: [],
      deckLeftInitialCount: 1,
      deckRightInitialCount: 0,
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, forcedPlay: true, forcedPlayAfterDraw: true },
      },
    });

    const afterDraw = applyActionWithHouseRules(state, { type: 'DRAW_CARD', playerId: 'p1', side: 'left' });
    expect(afterDraw.players[0]!.hand.map(c => c.id)).toEqual(['p1_blue', 'drawn_unplayable']);
    expect(afterDraw.currentPlayerIndex).toBe(0);

    const afterPass = applyActionWithHouseRules(afterDraw, { type: 'PASS', playerId: 'p1' });
    expect(afterPass.currentPlayerIndex).toBe(1);
  });
});

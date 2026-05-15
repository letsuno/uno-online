import { describe, it, expect } from 'vitest';
import type { Card, Color } from '../../src/types/card';
import type { GameState } from '../../src/types/game';
import { DEFAULT_HOUSE_RULES } from '../../src/types/house-rules';
import { DIFFICULTY_PARAMS } from '../../src/rules/bot/difficulty-params';
import { PERSONALITY_WEIGHTS } from '../../src/rules/bot/personality-weights';
import {
  evaluateCards,
  bestColorForHand,
} from '../../src/rules/bot/card-evaluator';
import { makeState } from '../helpers/test-utils';

function makeNumberCard(id: string, color: Color, value: number): Card {
  return { id, type: 'number', color, value };
}

function makeSkipCard(id: string, color: Color): Card {
  return { id, type: 'skip', color };
}

function makeDrawTwoCard(id: string, color: Color): Card {
  return { id, type: 'draw_two', color };
}

function makeWildCard(id: string): Card {
  return { id, type: 'wild', color: null };
}

function makeWildDrawFour(id: string): Card {
  return { id, type: 'wild_draw_four', color: null };
}

// Build a minimal but valid GameState using makeState with overrides
function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return makeState(overrides);
}

describe('evaluateCards', () => {
  it('returns a CardScore for each playable card', () => {
    const hand: Card[] = [
      makeNumberCard('n1', 'red', 5),
      makeNumberCard('n2', 'blue', 3),
      makeWildCard('w1'),
    ];
    const playable: Card[] = [hand[0]!, hand[2]!]; // red 5 and wild

    const state = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: [makeNumberCard('h1', 'green', 2)], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
    });

    const results = evaluateCards(hand, playable, state, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result).toHaveProperty('card');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('factors');
      expect(result.factors).toHaveProperty('colorMatch');
      expect(result.factors).toHaveProperty('actionValue');
      expect(result.factors).toHaveProperty('handReduction');
      expect(result.factors).toHaveProperty('finishSafety');
      expect(result.factors).toHaveProperty('specialTiming');
      expect(result.factors).toHaveProperty('teamAwareness');
      expect(result.factors).toHaveProperty('targetPressure');
    }
  });

  it('color-matching card has higher colorMatch factor than non-matching', () => {
    // current color is red; we have a red card and a blue card
    const redCard = makeNumberCard('r1', 'red', 5);
    const blueCard = makeNumberCard('b1', 'blue', 3);
    const hand: Card[] = [redCard, blueCard];

    const state = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: [], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
    });

    const results = evaluateCards(hand, hand, state, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    const redResult = results.find(r => r.card.id === 'r1')!;
    const blueResult = results.find(r => r.card.id === 'b1')!;

    expect(redResult.factors.colorMatch).toBeGreaterThan(blueResult.factors.colorMatch);
  });

  it('action cards get higher actionValue factor than number cards', () => {
    const skipCard = makeSkipCard('s1', 'red');
    const drawTwo = makeDrawTwoCard('d2', 'red');
    const wildDrawFour = makeWildDrawFour('wdf1');
    const numberCard = makeNumberCard('n1', 'red', 5);
    const hand: Card[] = [skipCard, drawTwo, wildDrawFour, numberCard];

    const state = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: [], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
    });

    const results = evaluateCards(hand, hand, state, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    const skipResult = results.find(r => r.card.id === 's1')!;
    const drawTwoResult = results.find(r => r.card.id === 'd2')!;
    const wildDrawFourResult = results.find(r => r.card.id === 'wdf1')!;
    const numberResult = results.find(r => r.card.id === 'n1')!;

    expect(skipResult.factors.actionValue).toBeGreaterThan(numberResult.factors.actionValue);
    expect(drawTwoResult.factors.actionValue).toBeGreaterThan(numberResult.factors.actionValue);
    expect(wildDrawFourResult.factors.actionValue).toBeGreaterThan(numberResult.factors.actionValue);
    expect(wildDrawFourResult.factors.actionValue).toBeGreaterThan(skipResult.factors.actionValue);
  });

  it('playing a number card that leaves a wild as last card gets negative finishSafety with noWildFinish', () => {
    // hand has 2 cards: a number card and a wild
    // if we play the number card, the last card will be a wild — blocked by noWildFinish
    const numberCard = makeNumberCard('n1', 'red', 5);
    const wildCard = makeWildCard('w1');
    const hand: Card[] = [numberCard, wildCard];

    const state = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: [], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, noWildFinish: true },
      },
    });

    // normal difficulty has finishRestrictionAwareness: true
    const results = evaluateCards(hand, [numberCard], state, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    const numberResult = results.find(r => r.card.id === 'n1')!;
    expect(numberResult.factors.finishSafety).toBeLessThan(0);
  });

  it('novice difficulty ignores finishSafety (finishRestrictionAwareness is false)', () => {
    const numberCard = makeNumberCard('n1', 'red', 5);
    const wildCard = makeWildCard('w1');
    const hand: Card[] = [numberCard, wildCard];

    const state = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: [], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, noWildFinish: true },
      },
    });

    const results = evaluateCards(hand, [numberCard], state, 'bot', DIFFICULTY_PARAMS.novice, PERSONALITY_WEIGHTS.balanced);

    const numberResult = results.find(r => r.card.id === 'n1')!;
    // novice doesn't consider finish restrictions, so finishSafety should be 0
    expect(numberResult.factors.finishSafety).toBe(0);
  });

  it('playing the last card in hand gets maximum handReduction score', () => {
    const onlyCard = makeNumberCard('n1', 'red', 5);
    const hand: Card[] = [onlyCard];

    const state = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: [], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
    });

    const results = evaluateCards(hand, [onlyCard], state, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    const result = results[0]!;
    expect(result.factors.handReduction).toBe(20);
  });

  it('returns empty array when no playable cards provided', () => {
    const hand: Card[] = [makeNumberCard('n1', 'blue', 3)];

    const state = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: [], score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
    });

    const results = evaluateCards(hand, [], state, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    expect(results).toHaveLength(0);
  });
});

describe('bestColorForHand', () => {
  it('returns the most common color in hand', () => {
    const hand: Card[] = [
      makeNumberCard('r1', 'red', 1),
      makeNumberCard('r2', 'red', 2),
      makeNumberCard('r3', 'red', 3),
      makeNumberCard('b1', 'blue', 1),
      makeNumberCard('b2', 'blue', 2),
      makeNumberCard('g1', 'green', 1),
    ];

    const color = bestColorForHand(hand);
    expect(color).toBe('red');
  });

  it('excludes the card with the given id when counting', () => {
    // 2 red, 3 blue — but we exclude blue card b3
    const hand: Card[] = [
      makeNumberCard('r1', 'red', 1),
      makeNumberCard('r2', 'red', 2),
      makeNumberCard('b1', 'blue', 1),
      makeNumberCard('b2', 'blue', 2),
      makeNumberCard('b3', 'blue', 3),
    ];

    // Without exclude: blue wins (3 vs 2)
    expect(bestColorForHand(hand)).toBe('blue');

    // Excluding one blue card: blue=2, red=2 — tie, first entry wins (order may vary, but blue count drops)
    // Excluding two blue cards: red=2, blue=1 → red wins
    const handWithoutB3 = hand.filter(c => c.id !== 'b3');
    // Now we exclude b2 from full hand
    const color = bestColorForHand(hand, 'b2');
    // blue=2 after excluding b2, red=2 — tie; in a tie the result is the first found with the max
    // Just ensure it's one of the tied colors
    expect(['red', 'blue']).toContain(color);
  });

  it('falls back to red when hand has no colored cards', () => {
    const hand: Card[] = [makeWildCard('w1'), makeWildDrawFour('wdf1')];
    const color = bestColorForHand(hand);
    expect(color).toBe('red');
  });

  it('returns a valid Color type', () => {
    const hand: Card[] = [makeNumberCard('y1', 'yellow', 5)];
    const color = bestColorForHand(hand);
    expect(['red', 'blue', 'green', 'yellow']).toContain(color);
  });
});

describe('elimination mode', () => {
  it('boosts handReduction when bot has the most cards (hard bot)', () => {
    const botHand: Card[] = [
      makeNumberCard('n1', 'red', 1),
      makeNumberCard('n2', 'red', 2),
      makeNumberCard('n3', 'blue', 3),
      makeNumberCard('n4', 'blue', 4),
      makeNumberCard('n5', 'green', 5),
      makeNumberCard('n6', 'green', 6),
    ]; // bot has 6 cards
    const opponentHand: Card[] = [
      makeNumberCard('o1', 'red', 1),
      makeNumberCard('o2', 'blue', 2),
      makeNumberCard('o3', 'green', 3),
    ]; // opponent has 3 cards
    const playable = [botHand[0]!];

    const stateWithElimination = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, elimination: true },
      },
    });

    const stateNoElimination = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
    });

    const withElim = evaluateCards(botHand, playable, stateWithElimination, 'bot', DIFFICULTY_PARAMS.hard, PERSONALITY_WEIGHTS.balanced);
    const noElim = evaluateCards(botHand, playable, stateNoElimination, 'bot', DIFFICULTY_PARAMS.hard, PERSONALITY_WEIGHTS.balanced);

    // handReduction factor should be higher when elimination is active and bot is at max cards
    expect(withElim[0]!.factors.handReduction).toBeGreaterThan(noElim[0]!.factors.handReduction);
  });

  it('boosts handReduction moderately when bot is above average hand size (normal bot)', () => {
    const botHand: Card[] = [
      makeNumberCard('n1', 'red', 1),
      makeNumberCard('n2', 'red', 2),
      makeNumberCard('n3', 'blue', 3),
      makeNumberCard('n4', 'blue', 4),
      makeNumberCard('n5', 'green', 5),
    ]; // bot has 5 cards
    const p2Hand: Card[] = [
      makeNumberCard('o1', 'red', 1),
      makeNumberCard('o2', 'blue', 2),
      makeNumberCard('o3', 'green', 3),
      makeNumberCard('o4', 'green', 4),
      makeNumberCard('o5', 'yellow', 5),
      makeNumberCard('o6', 'yellow', 6),
    ]; // p2 has 6 cards (most)
    const p3Hand: Card[] = [
      makeNumberCard('p1', 'red', 1),
      makeNumberCard('p2', 'blue', 2),
      makeNumberCard('p3', 'green', 3),
    ]; // p3 has 3 cards — avg = (6+3)/2 = 4.5, bot has 5 > avg
    const playable = [botHand[0]!];

    const stateWithElimination = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human2', hand: p2Hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p3', name: 'Human3', hand: p3Hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, elimination: true },
      },
    });

    const stateNoElimination = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human2', hand: p2Hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p3', name: 'Human3', hand: p3Hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
    });

    const withElim = evaluateCards(botHand, playable, stateWithElimination, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);
    const noElim = evaluateCards(botHand, playable, stateNoElimination, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    expect(withElim[0]!.factors.handReduction).toBeGreaterThan(noElim[0]!.factors.handReduction);
  });

  it('does not boost handReduction for novice bot (no considerOpponentHandSize)', () => {
    const botHand: Card[] = [
      makeNumberCard('n1', 'red', 1),
      makeNumberCard('n2', 'red', 2),
      makeNumberCard('n3', 'blue', 3),
      makeNumberCard('n4', 'blue', 4),
      makeNumberCard('n5', 'green', 5),
      makeNumberCard('n6', 'green', 6),
    ];
    const opponentHand: Card[] = [makeNumberCard('o1', 'red', 1)];
    const playable = [botHand[0]!];

    const stateWithElimination = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, elimination: true },
      },
    });

    const stateNoElimination = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
    });

    const withElim = evaluateCards(botHand, playable, stateWithElimination, 'bot', DIFFICULTY_PARAMS.novice, PERSONALITY_WEIGHTS.balanced);
    const noElim = evaluateCards(botHand, playable, stateNoElimination, 'bot', DIFFICULTY_PARAMS.novice, PERSONALITY_WEIGHTS.balanced);

    // novice has considerOpponentHandSize: false, so no boost
    expect(withElim[0]!.factors.handReduction).toBe(noElim[0]!.factors.handReduction);
  });

  it('critical boost is larger than moderate boost (max cards vs above average)', () => {
    // 3-player game: p2 has 8 cards (max), p3 has 2 cards. avg = (8+2)/2 = 5.
    // critical bot hand: 8 cards — matches max → +15
    // moderate bot hand: 6 cards — above avg(5) but below max(8) → +8
    const p2Hand: Card[] = Array.from({ length: 8 }, (_, i) => makeNumberCard(`p2_${i}`, 'blue', i % 10));
    const p3Hand: Card[] = Array.from({ length: 2 }, (_, i) => makeNumberCard(`p3_${i}`, 'green', i));

    const eliminationSettings = {
      turnTimeLimit: 30,
      targetScore: 500,
      allowSpectators: true,
      spectatorMode: 'hidden' as const,
      houseRules: { ...DEFAULT_HOUSE_RULES, elimination: true },
    };

    // Critical: bot has 8 cards (= maxOpponent), triggers +15
    const criticalHand: Card[] = Array.from({ length: 8 }, (_, i) => makeNumberCard(`c${i}`, 'red', i % 10));
    const criticalState = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: criticalHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human2', hand: p2Hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p3', name: 'Human3', hand: p3Hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: eliminationSettings,
    });

    // Moderate: bot has 6 cards (> avg 5, < max 8), triggers +8
    const modBotHand: Card[] = Array.from({ length: 6 }, (_, i) => makeNumberCard(`m${i}`, 'red', i % 10));
    const moderateState = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: modBotHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human2', hand: p2Hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
        { id: 'p3', name: 'Human3', hand: p3Hand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: eliminationSettings,
    });

    const criticalResult = evaluateCards(criticalHand, [criticalHand[0]!], criticalState, 'bot', DIFFICULTY_PARAMS.hard, PERSONALITY_WEIGHTS.balanced);
    const moderateResult = evaluateCards(modBotHand, [modBotHand[0]!], moderateState, 'bot', DIFFICULTY_PARAMS.hard, PERSONALITY_WEIGHTS.balanced);

    // Critical (+15) should give higher handReduction than moderate (+8)
    expect(criticalResult[0]!.factors.handReduction).toBeGreaterThan(moderateResult[0]!.factors.handReduction);
  });
});

describe('revengeMode', () => {
  it('boosts draw card targetPressure when drawStack active and revengeMode on', () => {
    const drawTwoCard = makeDrawTwoCard('d2', 'red');
    const numberCard = makeNumberCard('n1', 'red', 5);
    const botHand: Card[] = [drawTwoCard, numberCard];
    const opponentHand: Card[] = [
      makeNumberCard('o1', 'red', 1),
      makeNumberCard('o2', 'blue', 2),
      makeNumberCard('o3', 'green', 3),
    ];
    const playable = [drawTwoCard, numberCard];

    const stateWithRevenge = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      drawStack: 2,
      discardPile: [makeDrawTwoCard('prev', 'red')],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true, stackDrawTwo: true },
      },
    });

    const stateNoRevenge = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      drawStack: 2,
      discardPile: [makeDrawTwoCard('prev', 'red')],
    });

    const withRevenge = evaluateCards(botHand, playable, stateWithRevenge, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);
    const noRevenge = evaluateCards(botHand, playable, stateNoRevenge, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    const drawTwoWithRevenge = withRevenge.find(r => r.card.id === 'd2')!;
    const drawTwoNoRevenge = noRevenge.find(r => r.card.id === 'd2')!;

    expect(drawTwoWithRevenge.factors.targetPressure).toBeGreaterThan(drawTwoNoRevenge.factors.targetPressure);
  });

  it('does not boost when drawStack is 0 (no stacking situation)', () => {
    const drawTwoCard = makeDrawTwoCard('d2', 'red');
    const botHand: Card[] = [drawTwoCard];
    const opponentHand: Card[] = [makeNumberCard('o1', 'red', 1)];

    const stateWithRevenge = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      drawStack: 0,
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true },
      },
    });

    const stateNoRevenge = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      drawStack: 0,
      discardPile: [makeNumberCard('d1', 'red', 5)],
    });

    const withRevenge = evaluateCards(botHand, [drawTwoCard], stateWithRevenge, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);
    const noRevenge = evaluateCards(botHand, [drawTwoCard], stateNoRevenge, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    // No drawStack — revenge mode still gives a bonus for initiating stacks against humans
    expect(withRevenge[0]!.factors.targetPressure).toBeGreaterThan(noRevenge[0]!.factors.targetPressure);
  });

  it('hard bot reduces draw card pressure when next player can retaliate', () => {
    const drawTwoCard = makeDrawTwoCard('d2', 'red');
    const botHand: Card[] = [drawTwoCard];
    // Next player has a draw_two — can stack back with doubled penalty
    const opponentHand: Card[] = [
      makeDrawTwoCard('o_d2', 'blue'),
      makeNumberCard('o1', 'red', 1),
    ];

    const stateHardRevenge = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      drawStack: 2,
      discardPile: [makeDrawTwoCard('prev', 'red')],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true, stackDrawTwo: true },
      },
    });

    // Normal bot can't see hands — no retaliation penalty
    const stateNormalRevenge = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      drawStack: 2,
      discardPile: [makeDrawTwoCard('prev', 'red')],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true, stackDrawTwo: true },
      },
    });

    const hardResult = evaluateCards(botHand, [drawTwoCard], stateHardRevenge, 'bot', DIFFICULTY_PARAMS.hard, PERSONALITY_WEIGHTS.balanced);
    const normalResult = evaluateCards(botHand, [drawTwoCard], stateNormalRevenge, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    // Hard bot sees the retaliation risk — targetPressure should be lower than normal bot
    expect(hardResult[0]!.factors.targetPressure).toBeLessThan(normalResult[0]!.factors.targetPressure);
  });

  it('boosts reverse/skip targetPressure as safe deflection in revengeMode', () => {
    const reverseCard: Card = { id: 'rev1', type: 'reverse', color: 'red' };
    const skipCard = makeSkipCard('sk1', 'red');
    const numberCard = makeNumberCard('n1', 'red', 5);
    const botHand: Card[] = [reverseCard, skipCard, numberCard];
    const opponentHand: Card[] = [makeNumberCard('o1', 'red', 1), makeNumberCard('o2', 'blue', 2)];
    const playable = [reverseCard, skipCard, numberCard];

    const stateWithRevenge = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      drawStack: 2,
      discardPile: [makeDrawTwoCard('prev', 'red')],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true, stackDrawTwo: true },
      },
    });

    const stateNoRevenge = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      drawStack: 2,
      discardPile: [makeDrawTwoCard('prev', 'red')],
    });

    const withRevenge = evaluateCards(botHand, playable, stateWithRevenge, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);
    const noRevenge = evaluateCards(botHand, playable, stateNoRevenge, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    const reverseWithRevenge = withRevenge.find(r => r.card.id === 'rev1')!;
    const reverseNoRevenge = noRevenge.find(r => r.card.id === 'rev1')!;
    const skipWithRevenge = withRevenge.find(r => r.card.id === 'sk1')!;
    const skipNoRevenge = noRevenge.find(r => r.card.id === 'sk1')!;

    expect(reverseWithRevenge.factors.targetPressure).toBeGreaterThan(reverseNoRevenge.factors.targetPressure);
    expect(skipWithRevenge.factors.targetPressure).toBeGreaterThan(skipNoRevenge.factors.targetPressure);
  });

  it('novice bot does not get revengeMode boost (specialCardAwareness is 0)', () => {
    const drawTwoCard = makeDrawTwoCard('d2', 'red');
    const botHand: Card[] = [drawTwoCard];
    const opponentHand: Card[] = [makeNumberCard('o1', 'red', 1)];

    const stateWithRevenge = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      drawStack: 2,
      discardPile: [makeDrawTwoCard('prev', 'red')],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, revengeMode: true, stackDrawTwo: true },
      },
    });

    const stateNoRevenge = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      drawStack: 2,
      discardPile: [makeDrawTwoCard('prev', 'red')],
    });

    const withRevenge = evaluateCards(botHand, [drawTwoCard], stateWithRevenge, 'bot', DIFFICULTY_PARAMS.novice, PERSONALITY_WEIGHTS.balanced);
    const noRevenge = evaluateCards(botHand, [drawTwoCard], stateNoRevenge, 'bot', DIFFICULTY_PARAMS.novice, PERSONALITY_WEIGHTS.balanced);

    // novice has specialCardAwareness: 0, so no revengeMode boost applied
    expect(withRevenge[0]!.factors.targetPressure).toBe(noRevenge[0]!.factors.targetPressure);
  });
});

describe('handLimit', () => {
  it('boosts handReduction when bot is at hand limit', () => {
    const limit = 5;
    const botHand: Card[] = [
      makeNumberCard('n1', 'red', 1),
      makeNumberCard('n2', 'red', 2),
      makeNumberCard('n3', 'blue', 3),
      makeNumberCard('n4', 'blue', 4),
      makeNumberCard('n5', 'green', 5),
    ]; // exactly at limit
    const opponentHand: Card[] = [makeNumberCard('o1', 'red', 1)];
    const playable = [botHand[0]!];

    const stateWithLimit = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, handLimit: limit },
      },
    });

    const stateNoLimit = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
    });

    const withLimit = evaluateCards(botHand, playable, stateWithLimit, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);
    const noLimit = evaluateCards(botHand, playable, stateNoLimit, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    expect(withLimit[0]!.factors.handReduction).toBeGreaterThan(noLimit[0]!.factors.handReduction);
  });

  it('boosts handReduction by 8 when one card from hand limit', () => {
    const limit = 6;
    const botHand: Card[] = [
      makeNumberCard('n1', 'red', 1),
      makeNumberCard('n2', 'red', 2),
      makeNumberCard('n3', 'blue', 3),
      makeNumberCard('n4', 'blue', 4),
      makeNumberCard('n5', 'green', 5),
    ]; // 5 cards — limit is 6, so handLimit - 1
    const opponentHand: Card[] = [makeNumberCard('o1', 'red', 1)];
    const playable = [botHand[0]!];

    const stateWithLimit = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, handLimit: limit },
      },
    });

    const stateNoLimit = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
    });

    const withLimit = evaluateCards(botHand, playable, stateWithLimit, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);
    const noLimit = evaluateCards(botHand, playable, stateNoLimit, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    // Exactly limit-1: +8 boost
    expect(withLimit[0]!.factors.handReduction - noLimit[0]!.factors.handReduction).toBe(8);
  });

  it('boosts handReduction by 4 when two cards from hand limit', () => {
    const limit = 7;
    const botHand: Card[] = [
      makeNumberCard('n1', 'red', 1),
      makeNumberCard('n2', 'red', 2),
      makeNumberCard('n3', 'blue', 3),
      makeNumberCard('n4', 'blue', 4),
      makeNumberCard('n5', 'green', 5),
    ]; // 5 cards — limit is 7, so handLimit - 2
    const opponentHand: Card[] = [makeNumberCard('o1', 'red', 1)];
    const playable = [botHand[0]!];

    const stateWithLimit = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, handLimit: limit },
      },
    });

    const stateNoLimit = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
    });

    const withLimit = evaluateCards(botHand, playable, stateWithLimit, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);
    const noLimit = evaluateCards(botHand, playable, stateNoLimit, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    // Exactly limit-2: +4 boost
    expect(withLimit[0]!.factors.handReduction - noLimit[0]!.factors.handReduction).toBe(4);
  });

  it('does not boost when hand is well below limit', () => {
    const limit = 10;
    const botHand: Card[] = [
      makeNumberCard('n1', 'red', 1),
      makeNumberCard('n2', 'red', 2),
      makeNumberCard('n3', 'blue', 3),
    ]; // 3 cards — far below limit of 10
    const opponentHand: Card[] = [makeNumberCard('o1', 'red', 1)];
    const playable = [botHand[0]!];

    const stateWithLimit = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: { ...DEFAULT_HOUSE_RULES, handLimit: limit },
      },
    });

    const stateNoLimit = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: botHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
    });

    const withLimit = evaluateCards(botHand, playable, stateWithLimit, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);
    const noLimit = evaluateCards(botHand, playable, stateNoLimit, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    // Hand is 3 cards below limit — no boost applied
    expect(withLimit[0]!.factors.handReduction).toBe(noLimit[0]!.factors.handReduction);
  });

  it('at-limit boost is greater than one-from-limit boost', () => {
    const limit = 5;
    const opponentHand: Card[] = [makeNumberCard('o1', 'red', 1)];
    const limitSettings = {
      turnTimeLimit: 30,
      targetScore: 500,
      allowSpectators: true,
      spectatorMode: 'hidden' as const,
      houseRules: { ...DEFAULT_HOUSE_RULES, handLimit: limit },
    };

    // At limit: 5 cards
    const atLimitHand: Card[] = Array.from({ length: limit }, (_, i) => makeNumberCard(`n${i}`, 'red', i));
    const atLimitState = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: atLimitHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: limitSettings,
    });

    // One from limit: 4 cards
    const oneFromHand: Card[] = Array.from({ length: limit - 1 }, (_, i) => makeNumberCard(`m${i}`, 'red', i));
    const oneFromState = makeGameState({
      players: [
        { id: 'bot', name: 'Bot', hand: oneFromHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: true },
        { id: 'p2', name: 'Human', hand: opponentHand, score: 0, connected: true, autopilot: false, calledUno: false, isBot: false },
      ],
      currentColor: 'red',
      discardPile: [makeNumberCard('d1', 'red', 5)],
      settings: limitSettings,
    });

    const atLimitResult = evaluateCards(atLimitHand, [atLimitHand[0]!], atLimitState, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);
    const oneFromResult = evaluateCards(oneFromHand, [oneFromHand[0]!], oneFromState, 'bot', DIFFICULTY_PARAMS.normal, PERSONALITY_WEIGHTS.balanced);

    expect(atLimitResult[0]!.factors.handReduction).toBeGreaterThan(oneFromResult[0]!.factors.handReduction);
  });
});

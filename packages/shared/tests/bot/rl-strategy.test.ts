import { describe, expect, it } from 'vitest';
import type { Card, GameAction, Player } from '../../src';
import {
  BOT_DIFFICULTIES,
  DEFAULT_HOUSE_RULES,
  RL_FEATURE_COUNT,
  RL_FEATURE_NAMES,
  RL_TEACHER_FEATURE_INDEX,
  chooseBotAction,
  chooseFairRuleBotAction,
  encodeRlActionPlan,
  enumerateLegalActionPlans,
} from '../../src';
import { makeState, numberCard, skipCard, wildCard } from '../helpers/test-utils';

function botPlayer(hand: Card[]): Player {
  return {
    id: 'bot',
    name: 'RL Bot',
    hand,
    score: 0,
    connected: true,
    autopilot: false,
    calledUno: false,
    isBot: true,
    botConfig: { difficulty: 'rl', personality: 'strategic', aiProviderId: 'test-provider' },
  };
}

function opponent(hand: Card[]): Player {
  return {
    id: 'opponent',
    name: 'Opponent',
    hand,
    score: 0,
    connected: true,
    autopilot: false,
    calledUno: false,
    isBot: false,
  };
}

describe('production RL inference features', () => {
  it('matches the bundled 577-feature ONNX contract', () => {
    expect(RL_FEATURE_COUNT).toBe(577);
    expect(RL_FEATURE_NAMES).toHaveLength(RL_FEATURE_COUNT);
    expect(RL_TEACHER_FEATURE_INDEX).toBe(576);
    expect(BOT_DIFFICULTIES).toContain('rl');
  });

  it('does not encode hidden opponent card identities', () => {
    const ownHand = [numberCard('red', 5, 'own-red'), wildCard('own-wild')];
    const base = makeState({
      players: [
        botPlayer(ownHand),
        opponent([numberCard('blue', 1, 'hidden-a'), skipCard('green', 'hidden-b')]),
      ],
      currentPlayerIndex: 0,
      discardPile: [numberCard('red', 2, 'top')],
      currentColor: 'red',
    });
    const changedHiddenCards = {
      ...base,
      players: [
        botPlayer(ownHand),
        opponent([wildCard('different-a'), numberCard('yellow', 9, 'different-b')]),
      ],
    };
    const plan: GameAction[] = [{ type: 'PLAY_CARD', playerId: 'bot', cardId: 'own-red' }];

    expect(encodeRlActionPlan(base, 'bot', plan)).toEqual(
      encodeRlActionPlan(changedHiddenCards, 'bot', plan),
    );
  });

  it('emits finite normalized features for every legal action', () => {
    const state = makeState({
      players: [
        botPlayer([numberCard('red', 5, 'own-red'), wildCard('own-wild')]),
        opponent([numberCard('blue', 1, 'hidden')]),
      ],
      currentPlayerIndex: 0,
      discardPile: [numberCard('red', 2, 'top')],
      currentColor: 'red',
    });

    const { plans } = enumerateLegalActionPlans(state, 'bot');
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      const features = encodeRlActionPlan(state, 'bot', plan);
      expect(features).toHaveLength(RL_FEATURE_COUNT);
      expect(features.every(Number.isFinite)).toBe(true);
      expect(features.every(value => value >= -1 && value <= 1)).toBe(true);
    }
  });

  it('keeps the teacher marker at the production index', () => {
    const state = makeState({
      players: [
        botPlayer([numberCard('red', 5, 'own-red')]),
        opponent([numberCard('blue', 1, 'hidden')]),
      ],
      currentPlayerIndex: 0,
      discardPile: [numberCard('red', 2, 'top')],
      currentColor: 'red',
    });
    const plan: GameAction[] = [{ type: 'PLAY_CARD', playerId: 'bot', cardId: 'own-red' }];
    const ordinary = encodeRlActionPlan(state, 'bot', plan);
    const preferred = encodeRlActionPlan(state, 'bot', plan, true);

    expect(ordinary[RL_TEACHER_FEATURE_INDEX]).toBe(0);
    expect(preferred[RL_TEACHER_FEATURE_INDEX]).toBe(1);
    expect(preferred.slice(0, RL_TEACHER_FEATURE_INDEX))
      .toEqual(ordinary.slice(0, RL_TEACHER_FEATURE_INDEX));
  });

  it('encodes every supported house-rule field', () => {
    const expectedNames = Object.keys(DEFAULT_HOUSE_RULES).map(key => (
      `house_${key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}`
    ));
    expect(RL_FEATURE_NAMES).toEqual(expect.arrayContaining(expectedNames));
  });

  it('uses the fair rule bot when ONNX inference is unavailable', () => {
    const state = makeState({
      players: [
        botPlayer([numberCard('red', 5, 'own-red'), wildCard('own-wild')]),
        opponent([numberCard('green', 1, 'hidden')]),
      ],
      currentPlayerIndex: 0,
      discardPile: [numberCard('red', 2, 'top')],
      currentColor: 'red',
    });
    const preferred = chooseFairRuleBotAction(state, 'bot');

    expect(chooseBotAction(state, 'bot')).toEqual(preferred);
    expect(enumerateLegalActionPlans(state, 'bot').plans).toContainEqual(preferred);
  });
});

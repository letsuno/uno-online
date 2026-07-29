import { describe, it, expect } from 'vitest';
import type { Card, CardBack, Color } from '../../src/types/card';
import type { GameState, Player } from '../../src/types/game';
import type { BotConfig } from '../../src/types/bot';
import { DEFAULT_HOUSE_RULES } from '../../src/types/house-rules';
import { chooseBotAction } from '../../src/rules/bot/bot-strategy';
import { evaluateCards } from '../../src/rules/bot/card-evaluator';
import { DIFFICULTY_PARAMS } from '../../src/rules/bot/difficulty-params';
import { PERSONALITY_WEIGHTS } from '../../src/rules/bot/personality-weights';
import { makeState, makeCard } from '../helpers/test-utils';

const hardBot: BotConfig = { difficulty: 'hard', personality: 'strategic' };

function card(id: string, front: Partial<Card> & { type: Card['type'] }, back: CardBack): Card {
  return { id, color: null, ...front, back } as Card;
}

function player(id: string, hand: Card[], botConfig?: BotConfig): Player {
  return {
    id, name: id, hand, score: 0, connected: true, autopilot: false,
    calledUno: false, isBot: botConfig !== undefined, botConfig,
  };
}

function flipState(players: Player[], overrides: Partial<GameState> = {}): GameState {
  const base = makeState();
  return {
    ...base,
    players,
    currentPlayerIndex: 0,
    flipSide: 'light',
    currentColor: 'red',
    discardPile: [makeCard('number', 'red', { value: 3, id: 'top' })],
    settings: { ...base.settings, gameMode: 'flip', houseRules: DEFAULT_HOUSE_RULES },
    ...overrides,
  };
}

/** 一手牌，正面相同、背面不同——用于验证机器人不偷看自己的背面。 */
function botHand(backs: CardBack[]): Card[] {
  return [
    card('own_flip', { type: 'flip', color: 'red' }, backs[0]!),
    card('own_num', { type: 'number', color: 'red', value: 5 } as Partial<Card> & { type: Card['type'] }, backs[1]!),
    card('own_skip', { type: 'skip', color: 'red' }, backs[2]!),
  ];
}

describe('公平性红线：机器人不能读自己手牌的背面', () => {
  /** 只改自己手牌的背面，其余完全相同 —— 任何评分差异都意味着偷看了自己的背面。 */
  function factorsWithOwnBacks(backs: CardBack[]) {
    const opponentHand = [
      card('o1', { type: 'number', color: 'blue', value: 1 } as Partial<Card> & { type: Card['type'] }, { type: 'number', color: 'teal', value: 4 }),
      card('o2', { type: 'number', color: 'blue', value: 2 } as Partial<Card> & { type: Card['type'] }, { type: 'number', color: 'pink', value: 6 }),
    ];
    const bot = player('bot', botHand(backs), hardBot);
    const state = flipState([bot, player('p2', opponentHand)]);
    return evaluateCards(bot.hand, bot.hand, state, 'bot', DIFFICULTY_PARAMS.hard, PERSONALITY_WEIGHTS.strategic)
      .map(s => ({ id: s.card.id, score: s.score, factors: s.factors }));
  }

  const weakBacks: CardBack[] = [
    { type: 'number', color: 'pink', value: 1 },
    { type: 'number', color: 'teal', value: 2 },
    { type: 'number', color: 'orange', value: 3 },
  ];
  const strongBacks: CardBack[] = [
    { type: 'wild_draw_color', color: null },
    { type: 'draw_five', color: 'purple' },
    { type: 'skip_everyone', color: 'pink' },
  ];

  it('自己背面强弱不影响任何一张牌的评分', () => {
    expect(factorsWithOwnBacks(strongBacks)).toEqual(factorsWithOwnBacks(weakBacks));
  });

  it('自己手牌背面不同时，机器人的决策完全一致', () => {
    const opponentHand = [
      card('o1', { type: 'number', color: 'blue', value: 1 } as Partial<Card> & { type: Card['type'] }, { type: 'number', color: 'teal', value: 4 }),
      card('o2', { type: 'number', color: 'blue', value: 2 } as Partial<Card> & { type: Card['type'] }, { type: 'number', color: 'pink', value: 6 }),
    ];

    const stateA = flipState([
      player('bot', botHand(weakBacks), hardBot),
      player('p2', opponentHand.map(c => ({ ...c }))),
    ]);
    const stateB = flipState([
      player('bot', botHand(strongBacks), hardBot),
      player('p2', opponentHand.map(c => ({ ...c }))),
    ]);

    const actionsA = chooseBotAction(stateA, 'bot');
    const actionsB = chooseBotAction(stateB, 'bot');

    expect(actionsB).toEqual(actionsA);
  });
});

describe('机器人读对手背面（合法信息）', () => {
  function flipScoreWith(opponentBacks: CardBack[], tier: 'none' | 'color' | 'full'): number {
    const opponentHand = opponentBacks.map((b, i) =>
      card(`o${i}`, { type: 'number', color: 'blue', value: (i % 9) + 1 } as Partial<Card> & { type: Card['type'] }, b));

    const bot = player('bot', botHand([
      { type: 'number', color: 'pink', value: 1 },
      { type: 'number', color: 'teal', value: 2 },
      { type: 'number', color: 'orange', value: 3 },
    ]), hardBot);

    const state = flipState([bot, player('p2', opponentHand)]);
    const params = { ...DIFFICULTY_PARAMS.hard, infoAccess: { ...DIFFICULTY_PARAMS.hard.infoAccess, flipBackReading: tier } };
    const flipCard = bot.hand.find(c => c.type === 'flip')!;
    const scores = evaluateCards(bot.hand, [flipCard], state, 'bot', params, PERSONALITY_WEIGHTS.strategic);
    return scores[0]!.factors.specialTiming;
  }

  const harmlessBacks: CardBack[] = Array.from({ length: 6 }, (_, i) => ({ type: 'number' as const, color: 'teal' as Color, value: i + 1 }));
  const dangerousBacks: CardBack[] = Array.from({ length: 6 }, () => ({ type: 'draw_five' as const, color: 'purple' as Color }));

  it('full 档：对手背面全是重罚牌时更不愿意翻面', () => {
    expect(flipScoreWith(dangerousBacks, 'full')).toBeLessThan(flipScoreWith(harmlessBacks, 'full'));
  });

  it('none 档：不读背面，两种局面评分相同', () => {
    expect(flipScoreWith(dangerousBacks, 'none')).toBe(flipScoreWith(harmlessBacks, 'none'));
  });
});

describe('Flip 卡型估值', () => {
  function actionValueOf(c: Card): number {
    const bot = player('bot', [c, makeCard('number', 'red', { value: 9, id: 'filler' })], hardBot);
    const state = flipState([bot, player('p2', [makeCard('number', 'blue', { value: 1, id: 'x' })])]);
    const scores = evaluateCards(bot.hand, [c], state, 'bot', DIFFICULTY_PARAMS.hard, PERSONALITY_WEIGHTS.strategic);
    return scores[0]!.factors.actionValue;
  }

  it('罚摸越重估值越高：摸到指定色 > +5 > 万能+2 > 跳过全体 > +1', () => {
    const wdc = actionValueOf(makeCard('wild_draw_color', null, { id: 'a' }));
    const d5 = actionValueOf(makeCard('draw_five', 'red', { id: 'b' }));
    const wd2 = actionValueOf(makeCard('wild_draw_two', null, { id: 'c' }));
    const se = actionValueOf(makeCard('skip_everyone', 'red', { id: 'd' }));
    const d1 = actionValueOf(makeCard('draw_one', 'red', { id: 'e' }));

    expect(wdc).toBeGreaterThan(d5);
    expect(d5).toBeGreaterThan(wd2);
    expect(wd2).toBeGreaterThan(se);
    expect(se).toBeGreaterThan(d1);
  });

  it('经典卡型的估值没有被改动', () => {
    expect(actionValueOf(makeCard('wild_draw_four', null, { id: 'a' }))).toBe(10);
    expect(actionValueOf(makeCard('draw_two', 'red', { id: 'b' }))).toBe(8);
    expect(actionValueOf(makeCard('skip', 'red', { id: 'c' }))).toBe(6);
    expect(actionValueOf(makeCard('reverse', 'red', { id: 'd' }))).toBe(5);
    expect(actionValueOf(makeCard('wild', null, { id: 'e' }))).toBe(4);
  });
});

describe('机器人能处理所有 Flip 卡型', () => {
  const types: Card['type'][] = ['draw_one', 'draw_five', 'skip_everyone', 'flip', 'wild_draw_two', 'wild_draw_color'];

  for (const type of types) {
    it(`持有 ${type} 时能给出合法动作而不抛错`, () => {
      const isWild = type === 'wild_draw_two' || type === 'wild_draw_color';
      const c = makeCard(type, isWild ? null : 'red', { id: 'target' });
      const bot = player('bot', [c, makeCard('number', 'red', { value: 9, id: 'filler' })], hardBot);
      const state = flipState([bot, player('p2', [makeCard('number', 'blue', { value: 1, id: 'x' })])]);

      const actions = chooseBotAction(state, 'bot');
      expect(actions.length).toBeGreaterThan(0);
      expect(['PLAY_CARD', 'DRAW_CARD', 'PASS', 'CALL_UNO', 'CHOOSE_COLOR']).toContain(actions[0]!.type);
    });
  }
});

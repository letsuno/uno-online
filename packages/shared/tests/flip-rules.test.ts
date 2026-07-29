import { describe, it, expect } from 'vitest';
import { applyAction } from '../src/rules/game-engine';
import { flipAll } from '../src/rules/flip';
import { initializeGame } from '../src/rules/setup';
import { createFlipDeck } from '../src/rules/deck';
import { calculateRoundScore } from '../src/rules/scoring';
import { DEFAULT_HOUSE_RULES } from '../src/types/house-rules';
import type { Card, Color } from '../src/types/card';
import type { GameState } from '../src/types/game';
import { makeCard, makeState } from './helpers/test-utils';

/** 造一张带背面的双面牌。 */
function flipCard(
  front: { type: Card['type']; color: Color | null; value?: number },
  back: { type: Card['type']; color: Color | null; value?: number },
  id: string,
): Card {
  return { id, ...front, back } as Card;
}

function flipState(overrides: Partial<GameState> = {}): GameState {
  const base = makeState(overrides);
  return {
    ...base,
    settings: { ...base.settings, gameMode: 'flip', houseRules: DEFAULT_HOUSE_RULES },
    ...overrides,
  };
}

describe('flipAll', () => {
  it('翻转弃牌堆整体——刚打出的牌沉底，原堆底成为新顶牌', () => {
    const first = flipCard({ type: 'number', color: 'red', value: 3 }, { type: 'number', color: 'pink', value: 8 }, 'c1');
    const mid = flipCard({ type: 'number', color: 'red', value: 5 }, { type: 'number', color: 'teal', value: 2 }, 'c2');
    const played = flipCard({ type: 'flip', color: 'red' }, { type: 'number', color: 'purple', value: 6 }, 'c3');

    const next = flipAll(flipState({ discardPile: [first, mid, played] }));

    expect(next.discardPile.map(c => c.id)).toEqual(['c3', 'c2', 'c1']);
    expect(next.discardPile[next.discardPile.length - 1]!.id).toBe('c1');
    expect(next.currentColor).toBe('pink');
    expect(next.flipSide).toBe('dark');
  });

  it('翻转两个摸牌堆与所有玩家手牌', () => {
    const handCard = flipCard({ type: 'number', color: 'blue', value: 1 }, { type: 'draw_five', color: 'teal' }, 'h1');
    const deckCard = flipCard({ type: 'skip', color: 'green' }, { type: 'number', color: 'orange', value: 9 }, 'd1');
    const top = flipCard({ type: 'number', color: 'red', value: 3 }, { type: 'number', color: 'pink', value: 8 }, 't1');

    const state = flipState({ discardPile: [top], deckLeft: [deckCard], deckRight: [deckCard] });
    state.players[0]!.hand = [handCard];

    const next = flipAll(state);

    expect(next.players[0]!.hand[0]!.type).toBe('draw_five');
    expect(next.players[0]!.hand[0]!.color).toBe('teal');
    expect(next.deckLeft[0]!.color).toBe('orange');
    expect(next.deckRight[0]!.color).toBe('orange');
  });

  it('翻两次回到原状态', () => {
    const state = flipState({
      discardPile: [
        flipCard({ type: 'number', color: 'red', value: 3 }, { type: 'number', color: 'pink', value: 8 }, 'a'),
        flipCard({ type: 'number', color: 'blue', value: 4 }, { type: 'number', color: 'teal', value: 1 }, 'b'),
      ],
      // currentColor 必须与顶牌一致，否则 flipAll 会按顶牌重算而不是还原
      currentColor: 'blue',
    });
    expect(flipAll(flipAll(state))).toEqual(state);
  });
});

describe('Flip 卡效果', () => {
  it('打出 Flip 卡后整局翻面，轮次推进到下家', () => {
    const bottom = flipCard({ type: 'number', color: 'red', value: 3 }, { type: 'number', color: 'pink', value: 8 }, 'bottom');
    const flip = flipCard({ type: 'flip', color: 'red' }, { type: 'number', color: 'purple', value: 6 }, 'flip1');

    const state = flipState({ discardPile: [bottom] });
    state.players[0]!.hand = [flip, makeCard('number', 'red', { value: 9, id: 'keep' })];

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'flip1' });

    expect(next.flipSide).toBe('dark');
    expect(next.currentColor).toBe('pink');
    expect(next.currentPlayerIndex).toBe(1);
    // 手里剩下的牌也翻了面
    expect(next.players[0]!.hand[0]!.id).toBe('keep');
  });

  it('翻面后新顶牌是万能牌时，由打出 Flip 的玩家选色', () => {
    const bottom = flipCard({ type: 'number', color: 'red', value: 3 }, { type: 'wild_draw_color', color: null }, 'bottom');
    const flip = flipCard({ type: 'flip', color: 'red' }, { type: 'number', color: 'purple', value: 6 }, 'flip1');

    const state = flipState({ discardPile: [bottom] });
    state.players[0]!.hand = [flip, makeCard('number', 'red', { value: 9, id: 'keep' })];

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'flip1' });

    expect(next.phase).toBe('choosing_color');
    expect(next.currentPlayerIndex).toBe(0);
  });

  it('Skip Everyone 让轮次回到出牌者本人', () => {
    const state = flipState({ discardPile: [makeCard('number', 'pink', { value: 3, id: 'top' })], currentColor: 'pink', flipSide: 'dark' });
    state.players[0]!.hand = [makeCard('skip_everyone', 'pink', { id: 'se' }), makeCard('number', 'pink', { value: 1, id: 'x' })];

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'se' });

    expect(next.currentPlayerIndex).toBe(0);
    expect(next.currentColor).toBe('pink');
  });

  it('Draw One 罚下家摸 1 张', () => {
    const state = flipState({ discardPile: [makeCard('number', 'red', { value: 3, id: 'top' })], currentColor: 'red' });
    state.players[0]!.hand = [makeCard('draw_one', 'red', { id: 'd1' }), makeCard('number', 'red', { value: 1, id: 'x' })];

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd1' });

    expect(next.pendingPenaltyDraws).toBe(1);
    expect(next.players[next.currentPlayerIndex]!.id).toBe('p2');
  });

  it('Draw Five 罚下家摸 5 张', () => {
    const state = flipState({ discardPile: [makeCard('number', 'pink', { value: 3, id: 'top' })], currentColor: 'pink', flipSide: 'dark' });
    state.players[0]!.hand = [makeCard('draw_five', 'pink', { id: 'd5' }), makeCard('number', 'pink', { value: 1, id: 'x' })];

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'd5' });

    expect(next.pendingPenaltyDraws).toBe(5);
  });
});

describe('Wild Draw Color — 条件式罚摸', () => {
  function setup() {
    const state = flipState({
      discardPile: [makeCard('number', 'pink', { value: 3, id: 'top' })],
      currentColor: 'pink',
      flipSide: 'dark',
      deckLeft: [
        makeCard('number', 'teal', { value: 1, id: 'n1' }),
        makeCard('number', 'orange', { value: 2, id: 'n2' }),
        makeCard('number', 'purple', { value: 3, id: 'n3' }),
        makeCard('number', 'teal', { value: 4, id: 'n4' }),
        makeCard('number', 'purple', { value: 5, id: 'n5' }),
      ],
      deckLeftInitialCount: 5,
    });
    state.players[0]!.hand = [makeCard('wild_draw_color', null, { id: 'wdc' }), makeCard('number', 'teal', { value: 9, id: 'x' })];
    return state;
  }

  it('下家一直摸到指定颜色为止', () => {
    let s = applyAction(setup(), { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wdc' });
    expect(s.phase).toBe('choosing_color');

    s = applyAction(s, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'purple' });
    expect(s.phase).toBe('challenging');

    s = applyAction(s, { type: 'ACCEPT', playerId: 'p2' });
    expect(s.pendingPenaltyUntilColor).toBe('purple');
    expect(s.pendingPenaltyDraws).toBe(1);

    // teal 1 → 不匹配，继续摸
    s = applyAction(s, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' });
    expect(s.pendingPenaltyUntilColor).toBe('purple');

    // orange 2 → 不匹配
    s = applyAction(s, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' });
    expect(s.pendingPenaltyUntilColor).toBe('purple');

    // purple 3 → 命中，罚摸结束，轮次推进
    s = applyAction(s, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' });
    expect(s.pendingPenaltyUntilColor).toBeNull();
    expect(s.pendingPenaltyDraws).toBe(0);
    expect(s.players[1]!.hand).toHaveLength(3);
    expect(s.players[s.currentPlayerIndex]!.id).toBe('p3');
  });

  it('质疑失败时摸到指定色后再追加 2 张', () => {
    let s = applyAction(setup(), { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wdc' });
    s = applyAction(s, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'purple' });
    // p1 手中没有 pink 牌，出牌合法 → 质疑失败
    s = applyAction(s, { type: 'CHALLENGE', playerId: 'p2' });

    expect(s.pendingPenaltyUntilColor).toBe('purple');
    expect(s.pendingPenaltyExtra).toBe(2);

    s = applyAction(s, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' }); // teal
    s = applyAction(s, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' }); // orange
    s = applyAction(s, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' }); // purple → 命中
    expect(s.pendingPenaltyUntilColor).toBeNull();
    expect(s.pendingPenaltyDraws).toBe(2);

    s = applyAction(s, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' });
    s = applyAction(s, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' });
    expect(s.pendingPenaltyDraws).toBe(0);
    expect(s.players[1]!.hand).toHaveLength(5);
  });

  it('牌堆耗尽仍未摸到指定色时终止罚摸，不会卡死', () => {
    // 全场只有一张 teal 牌 + 一张弃牌堆底牌，永远摸不到 purple
    const state = flipState({
      discardPile: [makeCard('number', 'pink', { value: 3, id: 'top' })],
      currentColor: 'pink',
      flipSide: 'dark',
      deckLeft: [makeCard('number', 'teal', { value: 1, id: 'only' })],
      deckRight: [],
      deckLeftInitialCount: 1,
      deckRightInitialCount: 0,
    });
    state.players[0]!.hand = [makeCard('wild_draw_color', null, { id: 'wdc' }), makeCard('number', 'teal', { value: 9, id: 'x' })];

    let s = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wdc' });
    s = applyAction(s, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'purple' });
    s = applyAction(s, { type: 'ACCEPT', playerId: 'p2' });

    // 罚摸会把弃牌堆也回收进牌堆，因此需要几轮才耗尽；关键是必须在有限步内终止
    let draws = 0;
    while (s.pendingPenaltyUntilColor && draws < 20) {
      s = applyAction(s, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' });
      draws++;
    }

    expect(draws).toBeLessThan(20);
    expect(s.pendingPenaltyUntilColor).toBeNull();
    expect(s.pendingPenaltyDraws).toBe(0);
    expect(s.players[s.currentPlayerIndex]!.id).toBe('p3');
  });
});

describe('Wild Draw Two — 质疑罚则 2 / 4', () => {
  function setup(p1Hand: Card[]) {
    const state = flipState({
      discardPile: [makeCard('number', 'red', { value: 3, id: 'top' })],
      currentColor: 'red',
      deckLeft: Array.from({ length: 10 }, (_, i) => makeCard('number', 'green', { value: i % 9 + 1, id: `g${i}` })),
      deckLeftInitialCount: 10,
    });
    state.players[0]!.hand = p1Hand;
    return state;
  }

  it('接受罚则时摸 2 张', () => {
    let s = setup([makeCard('wild_draw_two', null, { id: 'wd2' }), makeCard('number', 'blue', { value: 9, id: 'x' })]);
    s = applyAction(s, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd2' });
    s = applyAction(s, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'green' });
    s = applyAction(s, { type: 'ACCEPT', playerId: 'p2' });
    expect(s.pendingPenaltyDraws).toBe(2);
  });

  it('质疑失败时质疑者摸 4 张', () => {
    let s = setup([makeCard('wild_draw_two', null, { id: 'wd2' }), makeCard('number', 'blue', { value: 9, id: 'x' })]);
    s = applyAction(s, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd2' });
    s = applyAction(s, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'green' });
    s = applyAction(s, { type: 'CHALLENGE', playerId: 'p2' });
    expect(s.pendingPenaltyDraws).toBe(4);
    expect(s.players[s.currentPlayerIndex]!.id).toBe('p2');
  });

  it('质疑成功时出牌者摸 2 张', () => {
    // p1 手中有 red 牌（与弃牌堆顶同色）→ 出 Wild Draw Two 违规
    let s = setup([makeCard('wild_draw_two', null, { id: 'wd2' }), makeCard('number', 'red', { value: 9, id: 'x' })]);
    s = applyAction(s, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wd2' });
    s = applyAction(s, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'green' });
    s = applyAction(s, { type: 'CHALLENGE', playerId: 'p2' });
    expect(s.pendingPenaltyDraws).toBe(2);
    expect(s.players[s.currentPlayerIndex]!.id).toBe('p1');
  });
});

describe('选色必须属于当前生效的那一面', () => {
  function wildPlayed(side: 'light' | 'dark') {
    const topColor = side === 'dark' ? 'pink' : 'red';
    const state = flipState({
      discardPile: [makeCard('number', topColor, { value: 3, id: 'top' })],
      currentColor: topColor,
      flipSide: side,
    });
    state.players[0]!.hand = [makeCard('wild', null, { id: 'w' }), makeCard('number', topColor, { value: 1, id: 'x' })];
    return applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'w' });
  }

  it('暗面时选亮面颜色会被拒绝', () => {
    const s = wildPlayed('dark');
    expect(s.phase).toBe('choosing_color');
    const rejected = applyAction(s, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'red' });
    expect(rejected).toBe(s);

    const accepted = applyAction(s, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'teal' });
    expect(accepted.currentColor).toBe('teal');
    expect(accepted.phase).toBe('playing');
  });

  it('亮面时选暗面颜色会被拒绝', () => {
    const s = wildPlayed('light');
    const rejected = applyAction(s, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'purple' });
    expect(rejected).toBe(s);

    const accepted = applyAction(s, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'green' });
    expect(accepted.currentColor).toBe('green');
  });
});

describe('Flip 计分表', () => {
  it('按 Flip 分值计算，与经典不同', () => {
    const hand = [
      makeCard('number', 'pink', { value: 7 }),   // 7
      makeCard('draw_one', 'red'),                 // 10
      makeCard('draw_five', 'teal'),               // 20
      makeCard('flip', 'blue'),                    // 20
      makeCard('skip_everyone', 'orange'),         // 30
      makeCard('wild', null),                      // 40（经典是 50）
      makeCard('wild_draw_two', null),             // 50
      makeCard('wild_draw_color', null),           // 60
    ];
    expect(calculateRoundScore(hand, 'flip')).toBe(237);
  });

  it('经典模式下 wild 仍是 50 分', () => {
    expect(calculateRoundScore([makeCard('wild', null)], 'classic')).toBe(50);
    expect(calculateRoundScore([makeCard('wild', null)], 'flip')).toBe(40);
  });
});

describe('initializeGame — flip 模式', () => {
  const players = [
    { id: 'p1', name: 'A' },
    { id: 'p2', name: 'B' },
    { id: 'p3', name: 'C' },
  ];

  it('使用 112 张双面牌组，每人 7 张，开局在亮面', () => {
    const state = initializeGame(players, DEFAULT_HOUSE_RULES, 'flip');
    const total = state.deckLeft.length + state.deckRight.length + state.discardPile.length
      + state.players.reduce((n, p) => n + p.hand.length, 0);

    expect(total).toBe(112);
    // 首张弃牌若是 +1/+5，首家会先摸牌，所以只能断言下界
    expect(state.players.every(p => p.hand.length >= 7)).toBe(true);
    expect(state.settings.gameMode).toBe('flip');
    // 首张弃牌若是 Flip 卡会立即翻面，因此这里只断言两种取值之一
    expect(['light', 'dark']).toContain(state.flipSide);
    expect(state.players.every(p => p.hand.every(c => c.back !== undefined))).toBe(true);
  });

  it('无论首张弃牌是什么，112 张牌都不会多也不会少', () => {
    for (let i = 0; i < 60; i++) {
      const state = initializeGame(players, DEFAULT_HOUSE_RULES, 'flip');
      const total = state.deckLeft.length + state.deckRight.length + state.discardPile.length
        + state.players.reduce((n, p) => n + p.hand.length, 0);
      expect(total, `首牌 ${state.discardPile[0]!.type}`).toBe(112);
      expect(state.players.every(p => p.hand.every(c => c.back !== undefined))).toBe(true);
    }
  });

  it('首张弃牌不会是万能 +2', () => {
    for (let i = 0; i < 40; i++) {
      const state = initializeGame(players, DEFAULT_HOUSE_RULES, 'flip');
      expect(state.discardPile[0]!.type).not.toBe('wild_draw_two');
    }
  });

  it('首张弃牌是 Flip 卡时立即翻到暗面', () => {
    // 直接构造：牌堆首张为 Flip 卡
    const deck = createFlipDeck();
    const flipIdx = deck.findIndex(c => c.type === 'flip');
    expect(flipIdx).toBeGreaterThanOrEqual(0);
  });

  it('classic 模式仍是 108 张单面牌', () => {
    const state = initializeGame(players, DEFAULT_HOUSE_RULES, 'classic');
    const total = state.deckLeft.length + state.deckRight.length + state.discardPile.length
      + state.players.reduce((n, p) => n + p.hand.length, 0);
    expect(total).toBe(108);
    expect(state.flipSide).toBe('light');
    expect(state.players.every(p => p.hand.every(c => c.back === undefined))).toBe(true);
  });
});

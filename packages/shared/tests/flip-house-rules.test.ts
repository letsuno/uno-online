import { describe, it, expect } from 'vitest';
import { applyActionWithHouseRules } from '../src/rules/house-rules-engine';
import { applyAction } from '../src/rules/game-engine';
import { canPlayCard } from '../src/rules/validation';
import { canStackOnto, canDeflect, resolvePenalty } from '../src/rules/stack-rules';
import { DEFAULT_HOUSE_RULES, getHouseRulesPresets } from '../src/types/house-rules';
import { FLIP_INCOMPATIBLE_RULES, normalizeHouseRulesForMode } from '../src/constants/house-rules';
import type { HouseRules } from '../src/types/house-rules';
import type { Card, CardBack } from '../src/types/card';
import type { GameState } from '../src/types/game';
import { makeState, makeCard } from './helpers/test-utils';

function hr(overrides: Partial<HouseRules>): HouseRules {
  return { ...DEFAULT_HOUSE_RULES, ...overrides };
}

function flipState(rules: Partial<HouseRules>, overrides: Partial<GameState> = {}): GameState {
  const base = makeState();
  return {
    ...base,
    flipSide: 'dark',
    currentColor: 'pink',
    discardPile: [makeCard('number', 'pink', { value: 3, id: 'top' })],
    settings: { ...base.settings, gameMode: 'flip', houseRules: hr(rules) },
    ...overrides,
  };
}

describe('叠加谓词', () => {
  const d1 = makeCard('draw_one', 'red', { id: 'd1' });
  const d5 = makeCard('draw_five', 'pink', { id: 'd5' });
  const wd2 = makeCard('wild_draw_two', null, { id: 'wd2' });
  const wdc = makeCard('wild_draw_color', null, { id: 'wdc' });

  it('开关关闭时不能叠', () => {
    expect(canStackOnto(d1, d1, hr({}))).toBe(false);
    expect(canStackOnto(d5, d5, hr({}))).toBe(false);
  });

  it('+1 叠 +1、+5 叠 +5', () => {
    expect(canStackOnto(d1, d1, hr({ flipStackDrawOne: true }))).toBe(true);
    expect(canStackOnto(d5, d5, hr({ flipStackDrawFive: true }))).toBe(true);
  });

  it('两条都开时可以跨类型互叠', () => {
    const both = hr({ flipStackDrawOne: true, flipStackDrawFive: true });
    expect(canStackOnto(d5, d1, both)).toBe(true);
    expect(canStackOnto(d1, d5, both)).toBe(true);
  });

  it('flipEscalateOnly 只允许往更重的罚则叠', () => {
    const esc = hr({ flipStackDrawOne: true, flipStackDrawFive: true, flipEscalateOnly: true });
    expect(canStackOnto(d5, d1, esc)).toBe(true);   // +1 → +5 升级，合法
    expect(canStackOnto(d1, d5, esc)).toBe(false);  // +5 → +1 降级，不合法
  });

  it('万能罚摸牌需要单独开关', () => {
    const noWild = hr({ flipStackDrawOne: true });
    expect(canStackOnto(wd2, d1, noWild)).toBe(false);

    const withWild = hr({ flipStackDrawOne: true, flipStackWildDraw: true });
    expect(canStackOnto(wd2, d1, withWild)).toBe(true);
    expect(canStackOnto(wdc, wd2, withWild)).toBe(true);
  });

  it('经典叠加语义没有被 Flip 键影响', () => {
    const dt = makeCard('draw_two', 'red', { id: 'dt' });
    const wd4 = makeCard('wild_draw_four', null, { id: 'wd4' });
    expect(canStackOnto(dt, dt, hr({ stackDrawTwo: true }))).toBe(true);
    expect(canStackOnto(dt, dt, hr({ flipStackDrawOne: true }))).toBe(false);
    expect(canStackOnto(wd4, dt, hr({ crossStack: true }))).toBe(true);
    expect(canStackOnto(dt, wd4, hr({ stackDrawFour: true }))).toBe(false);
  });
});

describe('挡罚谓词', () => {
  const reverse = makeCard('reverse', 'pink', { id: 'r' });
  const skipEveryone = makeCard('skip_everyone', 'pink', { id: 'se' });
  const d5 = makeCard('draw_five', 'pink', { id: 'd5' });
  const num = makeCard('number', 'pink', { value: 3, id: 'n' });

  it('flipReverseDeflect 允许 Reverse 反弹罚摸牌', () => {
    expect(canDeflect(reverse, d5, hr({ flipReverseDeflect: true }))).toBe(true);
    expect(canDeflect(reverse, d5, hr({}))).toBe(false);
  });

  it('flipSkipDeflect 允许 跳过全体 转移罚摸', () => {
    expect(canDeflect(skipEveryone, d5, hr({ flipSkipDeflect: true }))).toBe(true);
  });

  it('顶牌不是罚摸牌时不能挡', () => {
    expect(canDeflect(reverse, num, hr({ flipReverseDeflect: true }))).toBe(false);
  });
});

describe('罚则解析', () => {
  it('各卡型的罚摸张数', () => {
    expect(resolvePenalty(makeCard('draw_one', 'red', { id: 'a' }), 'red')).toEqual({ count: 1, untilColor: null });
    expect(resolvePenalty(makeCard('draw_five', 'pink', { id: 'b' }), 'pink')).toEqual({ count: 5, untilColor: null });
    expect(resolvePenalty(makeCard('wild_draw_two', null, { id: 'c' }), 'red')).toEqual({ count: 2, untilColor: null });
  });

  it('摸到指定色用 untilColor 表达，颜色取当前生效色', () => {
    expect(resolvePenalty(makeCard('wild_draw_color', null, { id: 'd' }), 'teal'))
      .toEqual({ count: 1, untilColor: 'teal' });
  });
});

describe('flipWildFlip —— Flip 卡万能出', () => {
  const top = makeCard('number', 'pink', { value: 3, id: 'top' });
  const flipCard = makeCard('flip', 'teal', { id: 'f' });

  it('关闭时 Flip 卡仍需匹配颜色或符号', () => {
    expect(canPlayCard(flipCard, top, 'pink', hr({}))).toBe(false);
  });

  it('开启时可以无视颜色打出', () => {
    expect(canPlayCard(flipCard, top, 'pink', hr({ flipWildFlip: true }))).toBe(true);
  });

  it('引擎实际接受这次出牌', () => {
    const state = flipState({ flipWildFlip: true }, {
      discardPile: [
        makeCard('number', 'pink', { value: 8, id: 'bottom' }),
        makeCard('number', 'pink', { value: 3, id: 'top' }),
      ],
    });
    state.players[0]!.hand = [
      { ...flipCard, back: { type: 'number', color: 'red', value: 2 } } as Card,
      makeCard('number', 'orange', { value: 1, id: 'x' }),
    ];

    const next = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'f' });
    expect(next).not.toBe(state);
    expect(next.flipSide).toBe('light');
  });
});

describe('flipKeepColorOnFlip —— 翻面保留颜色', () => {
  function playFlip(rules: Partial<HouseRules>) {
    // 翻面后的新顶牌是万能牌 → 默认要选色，开了村规则沿用对位色
    const bottom: Card = {
      id: 'bottom', type: 'number', color: 'pink', value: 8,
      back: { type: 'wild', color: null } as CardBack,
    } as Card;
    const flipCard: Card = {
      id: 'f', type: 'flip', color: 'pink',
      back: { type: 'number', color: 'red', value: 2 } as CardBack,
    } as Card;

    const state = flipState(rules, { discardPile: [bottom], currentColor: 'pink', flipSide: 'dark' });
    state.players[0]!.hand = [flipCard, makeCard('number', 'pink', { value: 1, id: 'x' })];
    return applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'f' });
  }

  it('默认进入选色阶段', () => {
    const next = playFlip({});
    expect(next.phase).toBe('choosing_color');
    expect(next.currentColor).toBeNull();
  });

  it('开启后直接沿用对位色，不选色', () => {
    const next = playFlip({ flipKeepColorOnFlip: true });
    expect(next.phase).toBe('playing');
    // 暗面 pink 的亮面对位色是 red
    expect(next.currentColor).toBe('red');
  });
});

describe('flipDrawColorCap —— 摸色上限', () => {
  function runDrawColor(cap: number | null) {
    const state = flipState({ flipDrawColorCap: cap }, {
      deckLeft: Array.from({ length: 12 }, (_, i) => makeCard('number', 'teal', { value: (i % 9) + 1, id: `t${i}` })),
      deckLeftInitialCount: 12,
      deckRight: [],
      deckRightInitialCount: 0,
    });
    state.players[0]!.hand = [makeCard('wild_draw_color', null, { id: 'wdc' }), makeCard('number', 'teal', { value: 9, id: 'x' })];

    let s = applyAction(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'wdc' });
    s = applyAction(s, { type: 'CHOOSE_COLOR', playerId: 'p1', color: 'purple' });
    s = applyAction(s, { type: 'ACCEPT', playerId: 'p2' });

    let draws = 0;
    while ((s.pendingPenaltyDraws ?? 0) > 0 && draws < 30) {
      s = applyAction(s, { type: 'DRAW_CARD', playerId: 'p2', side: 'left' });
      draws++;
    }
    return { drawn: s.players[1]!.hand.length, state: s };
  }

  it('设为 3 时最多摸 3 张就停', () => {
    const { drawn, state } = runDrawColor(3);
    expect(drawn).toBe(3);
    expect(state.pendingPenaltyUntilColor).toBeNull();
  });

  it('不限时会一直摸到牌堆耗尽（本局永远摸不到 purple）', () => {
    const { drawn } = runDrawColor(null);
    expect(drawn).toBeGreaterThan(3);
  });
});

describe('flipDarkDoubleScore —— 暗面结算翻倍', () => {
  function finishRound(rules: Partial<HouseRules>, side: 'light' | 'dark') {
    const topColor = side === 'dark' ? 'pink' : 'red';
    const state = flipState(rules, {
      flipSide: side,
      currentColor: topColor,
      discardPile: [makeCard('number', topColor, { value: 3, id: 'top' })],
    });
    state.players[0]!.hand = [makeCard('number', topColor, { value: 1, id: 'last' })];
    state.players[1]!.hand = [makeCard('number', topColor, { value: 9, id: 'a' })];
    state.players[2]!.hand = [makeCard('number', topColor, { value: 9, id: 'b' })];

    return applyActionWithHouseRules(state, { type: 'PLAY_CARD', playerId: 'p1', cardId: 'last' });
  }

  it('暗面结束时赢家得分翻倍', () => {
    const plain = finishRound({}, 'dark');
    const doubled = finishRound({ flipDarkDoubleScore: true }, 'dark');
    expect(plain.players[0]!.score).toBe(18);
    expect(doubled.players[0]!.score).toBe(36);
  });

  it('亮面结束时不翻倍', () => {
    const next = finishRound({ flipDarkDoubleScore: true }, 'light');
    expect(next.players[0]!.score).toBe(18);
  });
});

describe('叠加端到端：+5 叠 +5', () => {
  function setup(rules: Partial<HouseRules>) {
    const state = flipState(rules, {
      discardPile: [makeCard('number', 'pink', { value: 3, id: 'top' })],
      deckLeft: Array.from({ length: 30 }, (_, i) => makeCard('number', 'teal', { value: (i % 9) + 1, id: `t${i}` })),
      deckLeftInitialCount: 30,
      deckRight: [],
      deckRightInitialCount: 0,
    });
    state.players[0]!.hand = [makeCard('draw_five', 'pink', { id: 'p1d5' }), makeCard('number', 'pink', { value: 1, id: 'p1x' })];
    state.players[1]!.hand = [makeCard('draw_five', 'teal', { id: 'p2d5' }), makeCard('number', 'teal', { value: 2, id: 'p2x' })];
    return state;
  }

  it('开启 +5 叠加后，p2 可以把罚摸叠给 p3，p3 摸 10 张', () => {
    let s = applyActionWithHouseRules(setup({ flipStackDrawFive: true }), { type: 'PLAY_CARD', playerId: 'p1', cardId: 'p1d5' });
    expect(s.drawStack).toBe(5);
    expect(s.players[s.currentPlayerIndex]!.id).toBe('p2');

    s = applyActionWithHouseRules(s, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'p2d5' });
    expect(s.drawStack).toBe(10);
    expect(s.players[s.currentPlayerIndex]!.id).toBe('p3');

    const before = s.players[2]!.hand.length;
    let draws = 0;
    while ((s.drawStack > 0 || (s.pendingPenaltyDraws ?? 0) > 0) && draws < 30) {
      s = applyActionWithHouseRules(s, { type: 'DRAW_CARD', playerId: 'p3', side: 'left' });
      draws++;
    }
    expect(s.players[2]!.hand.length - before).toBe(10);
  });

  it('关闭叠加时 p2 只能自己摸 5 张', () => {
    let s = applyActionWithHouseRules(setup({}), { type: 'PLAY_CARD', playerId: 'p1', cardId: 'p1d5' });
    expect(s.drawStack).toBe(0);
    expect(s.pendingPenaltyDraws).toBe(5);
    expect(s.players[s.currentPlayerIndex]!.id).toBe('p2');

    // 罚摸未清前不能出牌
    const blocked = applyActionWithHouseRules(s, { type: 'PLAY_CARD', playerId: 'p2', cardId: 'p2d5' });
    expect(blocked).toBe(s);
  });
});

describe('村规预设按模式分派', () => {
  it('Flip 的派对/疯狂用 Flip 叠加规则，不用经典的 +2/+4', () => {
    const flipParty = getHouseRulesPresets('flip').party!;
    const flipCrazy = getHouseRulesPresets('flip').crazy!;

    expect(flipParty.flipStackDrawOne).toBe(true);
    expect(flipParty.flipStackDrawFive).toBe(true);
    expect(flipParty.stackDrawTwo).toBeUndefined();
    expect(flipParty.zeroRotateHands).toBeUndefined();

    expect(flipCrazy.flipStackWildDraw).toBe(true);
    expect(flipCrazy.flipReverseDeflect).toBe(true);
    expect(flipCrazy.flipDrawColorCap).toBe(5);
    expect(flipCrazy.crossStack).toBeUndefined();
  });

  it('经典预设不含任何 Flip 键', () => {
    for (const preset of Object.values(getHouseRulesPresets('classic'))) {
      for (const key of Object.keys(preset)) {
        expect(key.startsWith('flip')).toBe(false);
      }
    }
  });

  it('预设里的键都存在于 HouseRules 且没有被禁用项', () => {
    for (const mode of ['classic', 'flip'] as const) {
      for (const [name, preset] of Object.entries(getHouseRulesPresets(mode))) {
        for (const key of Object.keys(preset) as (keyof HouseRules)[]) {
          expect(DEFAULT_HOUSE_RULES, `${mode}/${name}`).toHaveProperty(key);
          if (mode === 'flip') {
            expect(FLIP_INCOMPATIBLE_RULES[key], `${mode}/${name}/${key} 是 Flip 下不可用的规则`).toBeUndefined();
          }
        }
      }
    }
  });
});

describe('切换模式时归一化村规', () => {
  it('切到 Flip 会清掉不兼容的经典村规', () => {
    const before = hr({ stackDrawTwo: true, zeroRotateHands: true, sevenSwapHands: true, flipStackDrawFive: true });
    const after = normalizeHouseRulesForMode(before, 'flip');

    expect(after.stackDrawTwo).toBe(false);
    expect(after.zeroRotateHands).toBe(false);
    // 两个模式通用的规则保持不变
    expect(after.sevenSwapHands).toBe(true);
    expect(after.flipStackDrawFive).toBe(true);
  });

  it('切回经典会清掉所有 Flip 专属村规', () => {
    const before = hr({ flipStackDrawFive: true, flipWildFlip: true, flipDrawColorCap: 5, sevenSwapHands: true });
    const after = normalizeHouseRulesForMode(before, 'classic');

    expect(after.flipStackDrawFive).toBe(false);
    expect(after.flipWildFlip).toBe(false);
    expect(after.flipDrawColorCap).toBeNull();
    expect(after.sevenSwapHands).toBe(true);
  });

  it('归一化是幂等的', () => {
    const once = normalizeHouseRulesForMode(hr({ stackDrawTwo: true, flipWildFlip: true }), 'flip');
    expect(normalizeHouseRulesForMode(once, 'flip')).toEqual(once);
  });
});

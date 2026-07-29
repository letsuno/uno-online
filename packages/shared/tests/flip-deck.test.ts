import { describe, it, expect } from 'vitest';
import { createDeck, createFlipDeck, cardToIdentity, serializeDecks, reshuffleDiscardIntoDeck } from '../src/rules/deck';
import { swapFace, sortHand, isWildCard, DARK_COLORS, LIGHT_COLORS } from '../src/types/card';
import type { Card, CardBack, CardType, Color } from '../src/types/card';
import { makeCard } from './helpers/test-utils';

function faceOf(card: Card): CardBack {
  return {
    type: card.type,
    color: card.color,
    ...(card.type === 'number' ? { value: card.value } : {}),
  };
}

function tally(faces: readonly CardBack[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of faces) {
    const key = f.type === 'number' ? `${f.color}_${f.value}` : `${f.color ?? 'wild'}_${f.type}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

describe('createFlipDeck — 牌组构成', () => {
  const deck = createFlipDeck();
  const lightFaces = deck.map(faceOf);
  const darkFaces = deck.map(c => c.back!);

  it('生成 112 张牌，每张都有背面', () => {
    expect(deck).toHaveLength(112);
    expect(deck.every(c => c.back !== undefined)).toBe(true);
  });

  it('牌 id 唯一', () => {
    expect(new Set(deck.map(c => c.id)).size).toBe(112);
  });

  // 官方配比（Mattel GDR44）：亮面 4 色 × 数字 1-9 各 2 张 + 每色 2 张 +1/Skip/Reverse/Flip + 4 Wild + 4 Wild Draw Two
  it('亮面构成与官方说明书一致', () => {
    const counts = tally(lightFaces);
    for (const color of LIGHT_COLORS) {
      for (let v = 1; v <= 9; v++) {
        expect(counts.get(`${color}_${v}`), `${color} ${v}`).toBe(2);
      }
      for (const type of ['draw_one', 'skip', 'reverse', 'flip'] as CardType[]) {
        expect(counts.get(`${color}_${type}`), `${color} ${type}`).toBe(2);
      }
    }
    expect(counts.get('wild_wild')).toBe(4);
    expect(counts.get('wild_wild_draw_two')).toBe(4);
    // 亮面不含 0 牌，也不含带色 +2
    expect(lightFaces.some(f => f.type === 'number' && f.value === 0)).toBe(false);
    expect(lightFaces.some(f => f.type === 'draw_two')).toBe(false);
  });

  // 暗面：4 色 × 数字 1-9 各 2 张 + 每色 2 张 +5/Skip Everyone/Reverse/Flip + 4 Wild + 4 Wild Draw Color
  it('暗面构成与官方说明书一致', () => {
    const counts = tally(darkFaces);
    for (const color of DARK_COLORS) {
      for (let v = 1; v <= 9; v++) {
        expect(counts.get(`${color}_${v}`), `${color} ${v}`).toBe(2);
      }
      for (const type of ['draw_five', 'skip_everyone', 'reverse', 'flip'] as CardType[]) {
        expect(counts.get(`${color}_${type}`), `${color} ${type}`).toBe(2);
      }
    }
    expect(counts.get('wild_wild')).toBe(4);
    expect(counts.get('wild_wild_draw_color')).toBe(4);
    expect(darkFaces.some(f => f.type === 'number' && f.value === 0)).toBe(false);
  });

  it('亮面只用亮色、暗面只用暗色', () => {
    const light = LIGHT_COLORS as readonly Color[];
    const dark = DARK_COLORS as readonly Color[];
    expect(lightFaces.every(f => f.color === null || light.includes(f.color))).toBe(true);
    expect(darkFaces.every(f => f.color === null || dark.includes(f.color))).toBe(true);
  });

  it('每张牌至少有一面是带色牌（万能牌不会背对背）', () => {
    expect(deck.every(c => c.color !== null || c.back!.color !== null)).toBe(true);
  });
});

describe('swapFace', () => {
  it('翻两次回到原样', () => {
    for (const card of createFlipDeck()) {
      expect(swapFace(swapFace(card))).toEqual(card);
    }
  });

  it('翻面后活动面变为原背面，背面变为原活动面', () => {
    const card = createFlipDeck()[0]!;
    const flipped = swapFace(card);
    expect(flipped.type).toBe(card.back!.type);
    expect(flipped.color).toBe(card.back!.color);
    expect(flipped.back).toEqual(faceOf(card));
    expect(flipped.id).toBe(card.id);
  });

  it('丢弃万能牌已选定的颜色', () => {
    const wild = createFlipDeck().find(c => c.type === 'wild')!;
    const withChoice = { ...wild, chosenColor: 'red' as Color };
    const flipped = swapFace(withChoice);
    expect('chosenColor' in flipped).toBe(false);
    expect(swapFace(flipped)).not.toHaveProperty('chosenColor');
  });

  it('对单面牌（classic）原样返回', () => {
    const card = makeCard('number', 'red', { value: 5 });
    expect(swapFace(card)).toBe(card);
  });
});

describe('cardToIdentity — 牌堆哈希稳定性', () => {
  it('双面牌的身份不随翻面改变', () => {
    for (const card of createFlipDeck()) {
      expect(cardToIdentity(swapFace(card))).toEqual(cardToIdentity(card));
    }
  });

  it('整副牌翻面后 serializeDecks 结果不变', () => {
    const deck = createFlipDeck();
    const half = deck.length / 2;
    const left = deck.slice(0, half);
    const right = deck.slice(half);
    const before = serializeDecks(left, right);
    const after = serializeDecks(left.map(swapFace), right.map(swapFace));
    expect(after).toBe(before);
  });

  it('身份仍能区分不同的牌', () => {
    const deck = createFlipDeck();
    const identities = new Set(deck.map(c => JSON.stringify(cardToIdentity(c))));
    // 每种配对出现 2 次（万能牌 4 次），因此去重后应少于 112 但保持足够区分度
    expect(identities.size).toBeGreaterThan(50);
  });

  it('单面牌（classic）的身份格式不变', () => {
    expect(cardToIdentity(makeCard('number', 'red', { value: 7 }))).toEqual({ color: 'red', type: 'number', value: 7 });
    expect(cardToIdentity(makeCard('wild', null))).toEqual({ color: null, type: 'wild' });
    expect(cardToIdentity(makeCard('skip', 'blue'))).toEqual({ color: 'blue', type: 'skip' });
  });
});

describe('回收洗牌保留背面', () => {
  it('reshuffleDiscardIntoDeck 不会丢掉万能牌的背面', () => {
    const wild = createFlipDeck().find(c => c.type === 'wild')!;
    const played: Card = { ...wild, chosenColor: 'red' as Color };
    const top = createFlipDeck().find(c => c.type === 'number')!;

    const { deck } = reshuffleDiscardIntoDeck([], [played, top]);
    const recycled = deck.find(c => c.id === wild.id)!;

    expect(recycled.back).toEqual(wild.back);
    expect(recycled).not.toHaveProperty('chosenColor');
  });
});

describe('classic 零回归', () => {
  it('createDeck 仍是 108 张且构成不变', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(108);
    expect(deck.filter(c => c.type === 'number' && c.value === 0)).toHaveLength(4);
    expect(deck.filter(c => c.type === 'draw_two')).toHaveLength(8);
    expect(deck.filter(c => c.type === 'wild_draw_four')).toHaveLength(4);
    expect(deck.every(c => c.back === undefined)).toBe(true);
    expect(deck.some(c => isWildCard(c) && c.type !== 'wild' && c.type !== 'wild_draw_four')).toBe(false);
  });

  it('sortHand 对经典手牌的排序结果不变', () => {
    const hand: Card[] = [
      makeCard('wild_draw_four', null, { id: 'a' }),
      makeCard('number', 'green', { value: 3, id: 'b' }),
      makeCard('skip', 'red', { id: 'c' }),
      makeCard('number', 'red', { value: 9, id: 'd' }),
      makeCard('wild', null, { id: 'e' }),
      makeCard('draw_two', 'blue', { id: 'f' }),
      makeCard('number', 'red', { value: 1, id: 'g' }),
    ];
    expect(sortHand(hand).map(c => c.id)).toEqual(['g', 'd', 'c', 'f', 'b', 'e', 'a']);
  });
});

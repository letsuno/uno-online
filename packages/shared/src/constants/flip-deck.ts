import type { CardBack, CardType, Color, DarkColor, LightColor } from '../types/card.js';

/**
 * UNO Flip 112 张牌的亮面 / 暗面固定配对表。
 *
 * 来源：BoardGameGeek 论坛帖 "UNO Flip! card list"
 *       https://boardgamegeek.com/thread/2731732/uno-flip-card-list
 *       （由玩家逐张实物记录；已采纳原帖作者在楼中确认的勘误：
 *         blue 6 的背面是 purple reverse，原帖误记为 purple flip）
 *
 * 校验：本表 112 条记录中，亮面 52 种带色牌面各出现 2 次、暗面 52 种带色牌面各出现 2 次，
 *       亮面 Wild / Wild Draw Two 各 4 次，暗面 Wild / Wild Draw Color 各 4 次，
 *       与 Mattel 官方说明书（GDR44）的牌组配比逐项吻合。
 *       该不变量由 tests/flip-deck.test.ts 守护。
 *
 * 配对固定不是可有可无的细节：玩家能看到对手手牌的背面，固定配对意味着可以由背面
 * 反推对手的正面持牌，这是 UNO Flip 的核心博弈层。随机配对会把这一层完全抹掉。
 * 详见 docs/uno-flip-mode-design.md §4.1 与附录 A。
 */

const n = (color: Color, value: number): CardBack => ({ type: 'number', color, value });
const a = (type: CardType, color: Color): CardBack => ({ type, color });
const w = (type: CardType): CardBack => ({ type, color: null });

export const FLIP_CARD_PAIRS: readonly (readonly [CardBack, CardBack])[] = [
  // ---- red ----
  [n('red', 1), n('pink', 3)],
  [n('red', 1), n('purple', 2)],
  [n('red', 2), a('reverse', 'orange')],
  [n('red', 2), a('draw_five', 'purple')],
  [n('red', 3), n('pink', 7)],
  [n('red', 3), w('wild_draw_color')],
  [n('red', 4), a('flip', 'orange')],
  [n('red', 4), a('draw_five', 'purple')],
  [n('red', 5), n('pink', 2)],
  [n('red', 5), n('teal', 5)],
  [n('red', 6), n('orange', 9)],
  [n('red', 6), a('skip_everyone', 'pink')],
  [n('red', 7), n('orange', 1)],
  [n('red', 7), n('purple', 5)],
  [n('red', 8), a('reverse', 'purple')],
  [n('red', 8), n('teal', 7)],
  [n('red', 9), n('purple', 5)],
  [n('red', 9), a('reverse', 'teal')],
  [a('draw_one', 'red'), n('pink', 3)],
  [a('draw_one', 'red'), n('pink', 4)],
  [a('skip', 'red'), a('draw_five', 'orange')],
  [a('skip', 'red'), w('wild')],
  [a('reverse', 'red'), n('purple', 3)],
  [a('reverse', 'red'), n('teal', 7)],
  [a('flip', 'red'), n('pink', 8)],
  [a('flip', 'red'), n('purple', 3)],

  // ---- yellow ----
  [n('yellow', 1), a('skip_everyone', 'pink')],
  [n('yellow', 1), w('wild')],
  [n('yellow', 2), n('teal', 1)],
  [n('yellow', 2), n('teal', 8)],
  [n('yellow', 3), a('draw_five', 'pink')],
  [n('yellow', 3), n('purple', 1)],
  [n('yellow', 4), a('draw_five', 'pink')],
  [n('yellow', 4), a('flip', 'purple')],
  [n('yellow', 5), n('purple', 9)],
  [n('yellow', 5), n('teal', 8)],
  [n('yellow', 6), a('skip_everyone', 'orange')],
  [n('yellow', 6), w('wild_draw_color')],
  [n('yellow', 7), n('orange', 2)],
  [n('yellow', 7), n('purple', 6)],
  [n('yellow', 8), n('orange', 2)],
  [n('yellow', 8), n('pink', 1)],
  [n('yellow', 9), n('purple', 4)],
  [n('yellow', 9), n('teal', 5)],
  [a('draw_one', 'yellow'), n('pink', 1)],
  [a('draw_one', 'yellow'), n('purple', 8)],
  [a('skip', 'yellow'), n('orange', 3)],
  [a('skip', 'yellow'), a('flip', 'teal')],
  [a('reverse', 'yellow'), a('flip', 'teal')],
  [a('reverse', 'yellow'), w('wild')],
  [a('flip', 'yellow'), n('orange', 8)],
  [a('flip', 'yellow'), n('pink', 4)],

  // ---- green ----
  [n('green', 1), n('orange', 5)],
  [n('green', 1), a('flip', 'orange')],
  [n('green', 2), a('draw_five', 'teal')],
  [n('green', 2), a('skip_everyone', 'teal')],
  [n('green', 3), a('flip', 'pink')],
  [n('green', 3), n('purple', 2)],
  [n('green', 4), n('pink', 8)],
  [n('green', 4), n('teal', 9)],
  [n('green', 5), n('orange', 7)],
  [n('green', 5), n('teal', 4)],
  [n('green', 6), n('pink', 5)],
  [n('green', 6), w('wild_draw_color')],
  [n('green', 7), n('orange', 6)],
  [n('green', 7), n('teal', 2)],
  [n('green', 8), a('reverse', 'pink')],
  [n('green', 8), n('teal', 9)],
  [n('green', 9), a('draw_five', 'orange')],
  [n('green', 9), a('reverse', 'pink')],
  [a('draw_one', 'green'), n('orange', 6)],
  [a('draw_one', 'green'), n('teal', 6)],
  [a('skip', 'green'), n('orange', 9)],
  [a('skip', 'green'), n('purple', 4)],
  [a('reverse', 'green'), n('orange', 1)],
  [a('reverse', 'green'), n('pink', 7)],
  [a('flip', 'green'), n('teal', 3)],
  [a('flip', 'green'), w('wild_draw_color')],

  // ---- blue ----
  [n('blue', 1), a('skip_everyone', 'purple')],
  [n('blue', 1), a('skip_everyone', 'purple')],
  [n('blue', 2), n('orange', 8)],
  [n('blue', 2), n('pink', 6)],
  [n('blue', 3), n('purple', 8)],
  [n('blue', 3), n('teal', 2)],
  [n('blue', 4), n('purple', 1)],
  [n('blue', 4), a('draw_five', 'teal')],
  [n('blue', 5), a('reverse', 'orange')],
  [n('blue', 5), n('pink', 9)],
  [n('blue', 6), a('reverse', 'purple')],
  [n('blue', 6), a('skip_everyone', 'teal')],
  [n('blue', 7), n('orange', 3)],
  [n('blue', 7), a('skip_everyone', 'orange')],
  [n('blue', 8), n('teal', 4)],
  [n('blue', 8), a('reverse', 'teal')],
  [n('blue', 9), n('orange', 5)],
  [n('blue', 9), a('flip', 'purple')],
  [a('draw_one', 'blue'), n('pink', 6)],
  [a('draw_one', 'blue'), n('teal', 6)],
  [a('skip', 'blue'), n('pink', 9)],
  [a('skip', 'blue'), n('teal', 1)],
  [a('reverse', 'blue'), n('orange', 4)],
  [a('reverse', 'blue'), w('wild')],
  [a('flip', 'blue'), n('purple', 6)],
  [a('flip', 'blue'), n('purple', 7)],

  // ---- wild ----
  [w('wild'), n('pink', 5)],
  [w('wild'), a('flip', 'pink')],
  [w('wild'), n('purple', 7)],
  [w('wild'), n('teal', 3)],
  [w('wild_draw_two'), n('orange', 4)],
  [w('wild_draw_two'), n('orange', 7)],
  [w('wild_draw_two'), n('pink', 2)],
  [w('wild_draw_two'), n('purple', 9)],
];

/** 亮暗色对位表。纯 UI / 村规约定，实物牌组的两面之间并无颜色对应关系。 */
export const LIGHT_TO_DARK_COLOR: Record<LightColor, DarkColor> = {
  red: 'pink',
  yellow: 'orange',
  green: 'teal',
  blue: 'purple',
};

export const DARK_TO_LIGHT_COLOR: Record<DarkColor, LightColor> = {
  pink: 'red',
  orange: 'yellow',
  teal: 'green',
  purple: 'blue',
};

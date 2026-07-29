import type { Card, CardType, Color } from '../types/card.js';
import type { HouseRules } from '../types/house-rules.js';

/**
 * 罚摸牌的「重量」，用于 `flipEscalateOnly`（只能往更重的罚则叠）。
 * 摸到指定色的张数不确定，视为最重。
 */
const PENALTY_RANK: Partial<Record<CardType, number>> = {
  draw_one: 1,
  draw_two: 2,
  wild_draw_two: 2,
  wild_draw_four: 4,
  draw_five: 5,
  wild_draw_color: 99,
};

export function isPenaltyCard(type: CardType): boolean {
  return PENALTY_RANK[type] !== undefined;
}

/** 该卡型的叠加开关是否打开。 */
function stackEnabled(type: CardType, hr: HouseRules): boolean {
  switch (type) {
    // 经典
    case 'draw_two': return hr.stackDrawTwo || hr.crossStack;
    case 'wild_draw_four': return hr.stackDrawFour || hr.crossStack;
    // UNO Flip
    case 'draw_one': return hr.flipStackDrawOne;
    case 'draw_five': return hr.flipStackDrawFive;
    case 'wild_draw_two':
    case 'wild_draw_color': return hr.flipStackWildDraw;
    default: return false;
  }
}

/**
 * `card` 能否叠在 `topCard` 上。
 *
 * 经典的四种组合（+2/+2、+4/+4、互叠）逐条保留原语义，不受 Flip 键影响；
 * Flip 侧则按「双方卡型的开关都打开」判定，可选再加升级限制。
 */
export function canStackOnto(card: Card, topCard: Card, hr: HouseRules): boolean {
  // ── 经典 ──
  if (hr.stackDrawTwo && card.type === 'draw_two' && topCard.type === 'draw_two') return true;
  if (hr.stackDrawFour && card.type === 'wild_draw_four' && topCard.type === 'wild_draw_four') return true;
  if (hr.crossStack && (
    (card.type === 'draw_two' && topCard.type === 'wild_draw_four') ||
    (card.type === 'wild_draw_four' && topCard.type === 'draw_two')
  )) return true;

  // ── UNO Flip ──
  const flipTypes: CardType[] = ['draw_one', 'draw_five', 'wild_draw_two', 'wild_draw_color'];
  if (flipTypes.includes(card.type) && isPenaltyCard(topCard.type)) {
    if (!stackEnabled(card.type, hr) || !stackEnabled(topCard.type, hr)) return false;
    if (hr.flipEscalateOnly) {
      return (PENALTY_RANK[card.type] ?? 0) >= (PENALTY_RANK[topCard.type] ?? 0);
    }
    return true;
  }

  return false;
}

/** 这张牌能否作为一段新叠加的起点。 */
export function canStartStack(card: Card, hr: HouseRules): boolean {
  return stackEnabled(card.type, hr);
}

/** 被罚摸时能否用这张牌转移/反弹罚摸。 */
export function canDeflect(card: Card, topCard: Card, hr: HouseRules): boolean {
  // 经典
  if (hr.reverseDeflectDrawTwo && card.type === 'reverse' && topCard.type === 'draw_two') return true;
  if (hr.reverseDeflectDrawFour && card.type === 'reverse' && topCard.type === 'wild_draw_four') return true;
  if (hr.skipDeflect && card.type === 'skip') return true;

  // UNO Flip
  if (!isPenaltyCard(topCard.type)) return false;
  if (hr.flipReverseDeflect && card.type === 'reverse') return true;
  if (hr.flipSkipDeflect && (card.type === 'skip' || card.type === 'skip_everyone')) return true;

  return false;
}

export interface ResolvedPenalty {
  /** 固定张数；条件式罚摸时为 1（配合 untilColor） */
  count: number;
  /** 非 null 表示「摸到该颜色为止」 */
  untilColor: Color | null;
}

/**
 * 一张罚摸牌打中时对方要承受的罚则。
 * 摸到指定色的张数不确定，用 untilColor 表达；颜色取当前生效色（出牌者刚选的那个）。
 */
export function resolvePenalty(card: Card, currentColor: Color | null): ResolvedPenalty {
  switch (card.type) {
    case 'draw_one': return { count: 1, untilColor: null };
    case 'draw_two':
    case 'wild_draw_two': return { count: 2, untilColor: null };
    case 'wild_draw_four': return { count: 4, untilColor: null };
    case 'draw_five': return { count: 5, untilColor: null };
    case 'wild_draw_color': return { count: 1, untilColor: currentColor };
    default: return { count: 0, untilColor: null };
  }
}

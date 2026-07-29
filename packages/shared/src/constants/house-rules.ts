import type { HouseRules } from '../types/house-rules.js';
import type { GameMode } from '../types/game.js';
import { DEFAULT_HOUSE_RULES } from '../types/house-rules.js';

export interface HouseRuleDefinition {
  key: keyof HouseRules;
  label: string;
  description: string;
}

export const HOUSE_RULE_DEFINITIONS: HouseRuleDefinition[] = [
  { key: 'stackDrawTwo', label: '+2 叠加', description: '被 +2 时可出 +2 叠加给下家' },
  { key: 'stackDrawFour', label: '+4 叠加', description: '被 +4 时可出 +4 叠加给下家' },
  { key: 'crossStack', label: '+2 和 +4 互叠', description: '被 +2 时可出 +4，反之亦然' },
  { key: 'reverseDeflectDrawTwo', label: 'Reverse 反弹 +2', description: '被 +2 时出 Reverse 反弹给上家' },
  { key: 'reverseDeflectDrawFour', label: 'Reverse 反弹 +4', description: '被 +4 时出 Reverse 反弹给上家' },
  { key: 'skipDeflect', label: 'Skip 挡罚', description: '被 +2/+4 时出 Skip 转移给下家' },
  { key: 'zeroRotateHands', label: '0 牌交换手牌', description: '打出 0 时所有人按方向传递手牌' },
  { key: 'sevenSwapHands', label: '7 牌交换', description: '打出 7 时与下家交换手牌' },
  { key: 'jumpIn', label: '同牌抢出', description: '持有完全相同的牌可不等轮次直接出' },
  { key: 'multiplePlaySameNumber', label: '同数字全出', description: '相同数字不同颜色可一次打出' },
  { key: 'wildFirstTurn', label: '万能牌开局可出', description: '允许万能牌作为第一张弃牌' },
  { key: 'drawUntilPlayable', label: '摸到能出为止', description: '无牌可出时一直摸到能出的牌' },
  { key: 'forcedPlayAfterDraw', label: '摸牌后必须出', description: '摸到可出的牌时强制打出' },
  { key: 'forcedPlay', label: '强制出牌', description: '有能出的牌就必须出' },
  { key: 'unoPenaltyCount', label: 'UNO 罚摸数量', description: '不喊 UNO 被抓罚摸张数' },
  { key: 'strictUnoCall', label: '严格 UNO 喊牌', description: '只能在手牌剩 1 张时喊 UNO' },
  { key: 'misplayPenalty', label: '误操作惩罚', description: '出非法牌罚摸 1 张' },
  { key: 'silentUno', label: '静默 UNO', description: '取消 UNO 喊话机制' },
  { key: 'noFunctionCardFinish', label: '空手赢不算', description: '最后一张不能是 +2/+4' },
  { key: 'noWildFinish', label: '末牌限制', description: '最后一张不能是万能牌' },
  { key: 'doubleScore', label: '积分翻倍', description: '赢家分数翻倍' },
  { key: 'noChallengeWildFour', label: '无质疑 +4', description: '关闭 +4 质疑机制' },
  { key: 'fastMode', label: '快速模式', description: '回合时间减半' },
  { key: 'noHints', label: '无提示模式', description: '关闭可出牌高亮' },
  { key: 'blindDraw', label: '暗牌模式', description: '摸牌看不到牌面' },
  { key: 'bombCard', label: '炸弹牌', description: '打出 3+ 张同数字时所有人各摸 1 张' },
  { key: 'elimination', label: '淘汰制', description: '每轮结束手牌最多者被淘汰' },
  { key: 'revengeMode', label: '复仇模式', description: '反击+2/+4时伤害翻倍' },
  { key: 'teamMode', label: '团队模式', description: '偶数玩家时对面是队友' },
  { key: 'handLimit', label: '手牌上限', description: '超过数量时不能摸牌' },
  { key: 'handRevealThreshold', label: '手牌透明', description: '手牌低于此数对所有人可见' },
  { key: 'blitzTimeLimit', label: '闪电战', description: '总时间限制（秒），超时手牌最少者赢' },
  { key: 'shuffleSeats', label: '随机座位', description: '每轮开始时随机打乱玩家座位顺序' },
];

/** UNO Flip 专属村规，仅在 flip 模式下显示。 */
export const FLIP_HOUSE_RULE_DEFINITIONS: HouseRuleDefinition[] = [
  { key: 'flipStackDrawOne', label: '+1 叠加', description: '被 +1 时可出 +1 叠加给下家' },
  { key: 'flipStackDrawFive', label: '+5 叠加', description: '被 +5 时可出 +5 叠加给下家' },
  { key: 'flipStackWildDraw', label: '万能罚摸叠加', description: '万能 +2 / 摸到指定色 可参与叠加' },
  { key: 'flipEscalateOnly', label: '仅可升级叠加', description: '只能叠更重的罚则（+1 → +5 可以，反之不行）' },
  { key: 'flipReverseDeflect', label: 'Reverse 反弹罚摸', description: '被罚摸时出 Reverse 反弹给上家' },
  { key: 'flipSkipDeflect', label: 'Skip 挡罚', description: '被罚摸时出 Skip / 跳过全体 转移给下家' },
  { key: 'flipWildFlip', label: 'Flip 万能出', description: 'Flip 卡可无视颜色随时打出' },
  { key: 'flipKeepColorOnFlip', label: '翻面保留颜色', description: '翻面后顶牌是万能牌时沿用对位色，不选色' },
  { key: 'flipShowOwnBacks', label: '背面透视', description: '能看到自己手牌的背面（休闲向）' },
  { key: 'flipDrawColorCap', label: '摸色上限', description: '摸到指定色最多摸几张' },
  { key: 'flipDarkDoubleScore', label: '暗面结算翻倍', description: '在暗面结束的回合赢家得分翻倍' },
];

/**
 * UNO Flip 模式下不可用的村规，值为用户可见的禁用原因。
 *
 * 这些规则要么在 Flip 牌组里根本触发不了（Flip 没有 0 牌），
 * 要么依赖经典专属卡型（+2 / +4），在 Flip 下是静默失效——
 * 与其让房主以为开了实际没生效，不如直接置灰并说明原因。
 * 对应的 Flip 版本（+1/+5 叠加等）见设计文档 §11。
 */
export const FLIP_INCOMPATIBLE_RULES: Partial<Record<keyof HouseRules, string>> = {
  zeroRotateHands: 'UNO Flip 牌组没有 0 牌',
  stackDrawTwo: 'Flip 的罚摸牌是 +1 / +5，需用 Flip 版叠加规则',
  stackDrawFour: 'Flip 没有 +4，需用 Flip 版叠加规则',
  crossStack: 'Flip 的罚摸卡型不同，需用 Flip 版叠加规则',
  reverseDeflectDrawTwo: 'Flip 的罚摸卡型不同',
  reverseDeflectDrawFour: 'Flip 没有 +4',
  skipDeflect: 'Flip 的罚摸卡型不同',
  noChallengeWildFour: 'Flip 没有 +4（对应的是万能 +2 / 摸到指定色）',
  bombCard: 'Flip 少了 0 这一档数字，且翻面会打散同数字组合',
};

/** 仅 Flip 模式有意义的村规键。 */
export const FLIP_ONLY_RULE_KEYS: (keyof HouseRules)[] =
  FLIP_HOUSE_RULE_DEFINITIONS.map((d) => d.key);

/**
 * 把村规配置归一到指定模式：清掉在该模式下无意义的键。
 *
 * 没有这一步的话，切换模式后另一模式的规则会以「看不见但仍开着」的状态留在配置里——
 * 玩家在 UI 上找不到它，却可能在切回去时突然生效。
 */
export function normalizeHouseRulesForMode(hr: HouseRules, mode: GameMode): HouseRules {
  const next = { ...hr };
  const strip = mode === 'flip'
    ? (Object.keys(FLIP_INCOMPATIBLE_RULES) as (keyof HouseRules)[])
    : FLIP_ONLY_RULE_KEYS;
  for (const key of strip) {
    (next as Record<string, unknown>)[key] = DEFAULT_HOUSE_RULES[key];
  }
  return next;
}

/**
 * 当前生效（与默认值不同）的村规定义。
 *
 * Flip 模式下会把 Flip 专属村规一并算进来——否则开了 +5 叠加，
 * 游戏内仍然显示「无额外村规」。
 */
export function getActiveHouseRuleDefinitions(
  hr: HouseRules | undefined,
  mode: GameMode = 'classic',
): HouseRuleDefinition[] {
  if (!hr) return [];
  const defs = mode === 'flip'
    ? [...HOUSE_RULE_DEFINITIONS, ...FLIP_HOUSE_RULE_DEFINITIONS]
    : HOUSE_RULE_DEFINITIONS;
  return defs.filter((d) => hr[d.key] !== DEFAULT_HOUSE_RULES[d.key]);
}

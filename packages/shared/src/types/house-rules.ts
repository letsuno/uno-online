import type { GameMode } from './game.js';

export interface HouseRules {
  stackDrawTwo: boolean;
  stackDrawFour: boolean;
  crossStack: boolean;
  reverseDeflectDrawTwo: boolean;
  reverseDeflectDrawFour: boolean;
  skipDeflect: boolean;
  zeroRotateHands: boolean;
  sevenSwapHands: boolean;
  jumpIn: boolean;
  multiplePlaySameNumber: boolean;
  wildFirstTurn: boolean;
  drawUntilPlayable: boolean;
  forcedPlayAfterDraw: boolean;
  handLimit: number | null;
  forcedPlay: boolean;
  handRevealThreshold: number | null;
  unoPenaltyCount: 2 | 4 | 6;
  strictUnoCall: boolean;
  misplayPenalty: boolean;
  fastMode: boolean;
  noHints: boolean;
  elimination: boolean;
  blitzTimeLimit: number | null;
  revengeMode: boolean;
  silentUno: boolean;
  teamMode: boolean;
  noFunctionCardFinish: boolean;
  noWildFinish: boolean;
  doubleScore: boolean;
  noChallengeWildFour: boolean;
  blindDraw: boolean;
  bombCard: boolean;
  shuffleSeats: boolean;

  // ── UNO Flip 专属村规（仅 gameMode === 'flip' 时生效）──
  /** 被 +1 时可出 +1 叠加给下家 */
  flipStackDrawOne: boolean;
  /** 被 +5 时可出 +5 叠加给下家（官方明确禁止，是最常见的加牌村规） */
  flipStackDrawFive: boolean;
  /** 万能罚摸牌（万能 +2 / 摸到指定色）可参与叠加 */
  flipStackWildDraw: boolean;
  /** 叠加只能往更重的罚则升：+1 → +5 合法，+5 → +1 不合法 */
  flipEscalateOnly: boolean;
  /** 被罚摸时可出 Reverse 把罚摸反弹给上家 */
  flipReverseDeflect: boolean;
  /** 被罚摸时可出 Skip / 跳过全体 把罚摸转移给下家 */
  flipSkipDeflect: boolean;
  /** Flip 卡视为万能牌，可无视颜色随时打出 */
  flipWildFlip: boolean;
  /** 翻面后新顶牌是万能牌时，按亮暗对位表沿用原颜色，不进入选色 */
  flipKeepColorOnFlip: boolean;
  /** 允许玩家看到自己手牌的背面（休闲向，大幅降低难度） */
  flipShowOwnBacks: boolean;
  /** 摸到指定色最多摸 N 张，null 为不限 */
  flipDrawColorCap: number | null;
  /** 在暗面结束的回合，赢家得分翻倍 */
  flipDarkDoubleScore: boolean;
}

export const DEFAULT_HOUSE_RULES: HouseRules = {
  stackDrawTwo: false,
  stackDrawFour: false,
  crossStack: false,
  reverseDeflectDrawTwo: false,
  reverseDeflectDrawFour: false,
  skipDeflect: false,
  zeroRotateHands: false,
  sevenSwapHands: false,
  jumpIn: false,
  multiplePlaySameNumber: false,
  wildFirstTurn: false,
  drawUntilPlayable: false,
  forcedPlayAfterDraw: false,
  handLimit: null,
  forcedPlay: false,
  handRevealThreshold: null,
  unoPenaltyCount: 2,
  strictUnoCall: false,
  misplayPenalty: false,
  fastMode: false,
  noHints: false,
  elimination: false,
  blitzTimeLimit: null,
  revengeMode: false,
  silentUno: false,
  teamMode: false,
  noFunctionCardFinish: false,
  noWildFinish: false,
  doubleScore: false,
  noChallengeWildFour: false,
  blindDraw: false,
  bombCard: false,
  shuffleSeats: false,

  flipStackDrawOne: false,
  flipStackDrawFive: false,
  flipStackWildDraw: false,
  flipEscalateOnly: false,
  flipReverseDeflect: false,
  flipSkipDeflect: false,
  flipWildFlip: false,
  flipKeepColorOnFlip: false,
  flipShowOwnBacks: false,
  flipDrawColorCap: null,
  flipDarkDoubleScore: false,
};

/** 经典 UNO 的村规预设。 */
export const HOUSE_RULES_PRESETS: Record<string, Partial<HouseRules>> = {
  classic: {},
  party: {
    stackDrawTwo: true,
    stackDrawFour: true,
    zeroRotateHands: true,
    sevenSwapHands: true,
    jumpIn: true,
    drawUntilPlayable: true,
  },
  crazy: {
    stackDrawTwo: true,
    stackDrawFour: true,
    crossStack: true,
    reverseDeflectDrawTwo: true,
    reverseDeflectDrawFour: true,
    skipDeflect: true,
    zeroRotateHands: true,
    sevenSwapHands: true,
    jumpIn: true,
    multiplePlaySameNumber: true,
    drawUntilPlayable: true,
    forcedPlayAfterDraw: true,
    doubleScore: true,
    noChallengeWildFour: true,
  },
};

/**
 * UNO Flip 的村规预设。
 *
 * 与经典预设一一对应，但把 +2/+4 相关的规则换成 Flip 的对应物：
 * 叠加走 +1/+5/万能罚摸，挡罚走 Flip 版，0 牌交换（Flip 无 0 牌）换成 Flip 万能出。
 */
export const FLIP_HOUSE_RULES_PRESETS: Record<string, Partial<HouseRules>> = {
  classic: {},
  party: {
    flipStackDrawOne: true,
    flipStackDrawFive: true,
    flipWildFlip: true,
    sevenSwapHands: true,
    jumpIn: true,
    drawUntilPlayable: true,
  },
  crazy: {
    flipStackDrawOne: true,
    flipStackDrawFive: true,
    flipStackWildDraw: true,
    flipReverseDeflect: true,
    flipSkipDeflect: true,
    flipWildFlip: true,
    flipDarkDoubleScore: true,
    flipDrawColorCap: 5,
    sevenSwapHands: true,
    jumpIn: true,
    multiplePlaySameNumber: true,
    drawUntilPlayable: true,
    forcedPlayAfterDraw: true,
    doubleScore: true,
  },
};

export function getHouseRulesPresets(mode: GameMode): Record<string, Partial<HouseRules>> {
  return mode === 'flip' ? FLIP_HOUSE_RULES_PRESETS : HOUSE_RULES_PRESETS;
}

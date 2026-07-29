// packages/shared/src/rules/bot/difficulty-params.ts
import type { BotDifficulty } from '../../types/bot.js';

export interface DelayConfig {
  base: [number, number];
  perCard: number;
  maxDelay: number;
}

export interface DifficultyParams {
  infoAccess: {
    canSeeOpponentHands: boolean;
    canSeeDeckTopCards: number;
    /**
     * UNO Flip：从对手手牌背面反推其正面持牌的能力。
     * 这是**合法**信息——人类玩家同样看得见对手的背面，配对表也是公开的。
     * 'none' 不用；'color' 只看背面颜色；'full' 连卡型一起纳入决策。
     */
    flipBackReading: 'none' | 'color' | 'full';
  };
  considerOpponentHandSize: boolean;
  considerTeamStrategy: boolean;
  mistakeRate: number;
  scoreNoise: number;
  unoCallRate: number;
  unoCatchRate: number;
  unoCatchDelay: [number, number];
  challengeRate: number;
  specialCardAwareness: number;
  finishRestrictionAwareness: boolean;
  /** Knows that playing a WD4 while holding the current color is challengeable */
  wildFourLegalityAwareness: boolean;
  conserveSpecialCards: boolean;
  globalThreatAwareness: boolean;
  botCoalition: boolean;
  delay: DelayConfig;
}

export const DIFFICULTY_PARAMS: Record<BotDifficulty, DifficultyParams> = {
  novice: {
    infoAccess: { canSeeOpponentHands: false, canSeeDeckTopCards: 0, flipBackReading: 'none' },
    considerOpponentHandSize: false,
    considerTeamStrategy: false,
    mistakeRate: 0.4,
    scoreNoise: 0,
    unoCallRate: 0.3,
    unoCatchRate: 0.0,
    unoCatchDelay: [0, 0],
    challengeRate: 0.0,
    specialCardAwareness: 0.0,
    finishRestrictionAwareness: false,
    wildFourLegalityAwareness: false,
    conserveSpecialCards: false,
    globalThreatAwareness: false,
    botCoalition: false,
    delay: { base: [2000, 3500], perCard: 200, maxDelay: 5000 },
  },
  easy: {
    infoAccess: { canSeeOpponentHands: false, canSeeDeckTopCards: 0, flipBackReading: 'none' },
    considerOpponentHandSize: false,
    considerTeamStrategy: false,
    mistakeRate: 0.25,
    scoreNoise: 15,
    unoCallRate: 0.6,
    unoCatchRate: 0.2,
    unoCatchDelay: [2000, 4000],
    challengeRate: 0.1,
    specialCardAwareness: 0.2,
    finishRestrictionAwareness: false,
    wildFourLegalityAwareness: false,
    conserveSpecialCards: false,
    globalThreatAwareness: false,
    botCoalition: false,
    delay: { base: [1500, 3000], perCard: 150, maxDelay: 4500 },
  },
  normal: {
    infoAccess: { canSeeOpponentHands: false, canSeeDeckTopCards: 0, flipBackReading: 'color' },
    considerOpponentHandSize: true,
    considerTeamStrategy: true,
    mistakeRate: 0.05,
    scoreNoise: 3,
    unoCallRate: 0.9,
    unoCatchRate: 0.5,
    unoCatchDelay: [1000, 3000],
    challengeRate: 0.3,
    specialCardAwareness: 0.6,
    finishRestrictionAwareness: true,
    wildFourLegalityAwareness: true,
    conserveSpecialCards: true,
    globalThreatAwareness: true,
    botCoalition: true,
    delay: { base: [1200, 2500], perCard: 100, maxDelay: 4000 },
  },
  hard: {
    infoAccess: { canSeeOpponentHands: true, canSeeDeckTopCards: 3, flipBackReading: 'full' },
    considerOpponentHandSize: true,
    considerTeamStrategy: true,
    mistakeRate: 0.0,
    scoreNoise: 0,
    unoCallRate: 1.0,
    unoCatchRate: 0.9,
    unoCatchDelay: [500, 2000],
    challengeRate: -1,
    specialCardAwareness: 1.0,
    finishRestrictionAwareness: true,
    wildFourLegalityAwareness: true,
    conserveSpecialCards: true,
    globalThreatAwareness: true,
    botCoalition: true,
    delay: { base: [800, 2000], perCard: 80, maxDelay: 3500 },
  },
};

// packages/shared/src/rules/bot/personality-weights.ts
import type { BotPersonality } from '../../types/bot.js';

export interface PersonalityWeights {
  colorMatch: number;
  actionValue: number;
  handReduction: number;
  finishSafety: number;
  specialTiming: number;
  teamAwareness: number;
  targetPressure: number;
  cardConservation: number;
  globalThreat: number;
  coalitionTactics: number;
}

export const PERSONALITY_WEIGHTS: Record<BotPersonality, PersonalityWeights> = {
  aggressive: {
    colorMatch: 0.6,
    actionValue: 1.8,
    handReduction: 0.8,
    finishSafety: 0.7,
    specialTiming: 1.2,
    teamAwareness: 0.6,
    targetPressure: 1.6,
    cardConservation: 0.4,
    globalThreat: 1.4,
    coalitionTactics: 1.2,
  },
  defensive: {
    colorMatch: 1.5,
    actionValue: 0.4,
    handReduction: 1.2,
    finishSafety: 1.3,
    specialTiming: 0.8,
    teamAwareness: 1.2,
    targetPressure: 0.5,
    cardConservation: 1.6,
    globalThreat: 0.8,
    coalitionTactics: 0.8,
  },
  chaotic: {
    colorMatch: 0.8,
    actionValue: 1.0,
    handReduction: 0.6,
    finishSafety: 0.5,
    specialTiming: 0.4,
    teamAwareness: 0.3,
    targetPressure: 1.2,
    cardConservation: 0.3,
    globalThreat: 0.6,
    coalitionTactics: 0.5,
  },
  strategic: {
    colorMatch: 1.0,
    actionValue: 0.8,
    handReduction: 1.5,
    finishSafety: 1.4,
    specialTiming: 1.6,
    teamAwareness: 1.4,
    targetPressure: 1.0,
    cardConservation: 1.5,
    globalThreat: 1.3,
    coalitionTactics: 1.4,
  },
  balanced: {
    colorMatch: 1.0,
    actionValue: 1.0,
    handReduction: 1.0,
    finishSafety: 1.0,
    specialTiming: 1.0,
    teamAwareness: 1.0,
    targetPressure: 1.0,
    cardConservation: 1.0,
    globalThreat: 1.0,
    coalitionTactics: 1.0,
  },
};

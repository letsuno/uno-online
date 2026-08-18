export {
  createDeck,
  shuffleDeck,
  reshuffleDiscardIntoDeck,
  reshuffleSideFromDiscard,
  serializeDeck,
  serializeDecks,
  cardToIdentity,
} from './deck.js';
export type { CardIdentity } from './deck.js';
export {
  canPlayCard,
  getPlayableCards,
  isValidWildDrawFour,
  canRespondToDrawStack,
  isExactJumpInMatch,
} from './validation.js';
export { getNextPlayerIndex, getNextAliveIndex, countAlivePlayers, rotateHands, reverseDirection } from './turn.js';
export { dealCards, handleFirstDiscard, initializeGame, initializeNextRound } from './setup.js';
export type { DealResult, FirstCardEffect, FirstDiscardResult } from './setup.js';
export { calculateRoundScore, calculateRoundScores } from './scoring.js';
export { applyAction } from './game-engine.js';
export { applyActionWithHouseRules } from './house-rules-engine.js';
export type { HouseRulePlugin, RuleMetadata, RuleContext, PreCheckResult } from './house-rule-types.js';
export { buildRuleContext } from './house-rule-helpers.js';
export { getAllRuleMetadata } from './house-rule-registry.js';
export { PRE_CHECK_PLUGINS, POST_PROCESS_PLUGINS } from './rules/index.js';
export {
  chooseAutopilotAction,
  chooseAutopilotJumpInAction,
  canJumpIn,
  chooseJumpInAction,
} from './autopilot-strategy.js';
export { HOUSE_RULE_DESCRIPTIONS } from './rule-descriptions.js';
export { BOT_NAMES, pickBotName } from './bot/bot-names.js';
export { chooseBotAction, chooseBotJumpInAction, chooseFairRuleBotAction } from './bot/bot-strategy.js';
export {
  canonicalizeRlPlans,
  encodeRlActionPlan,
  heuristicRlPlanScore,
  rlPlanKey,
  RL_FEATURE_COUNT,
  RL_FEATURE_NAMES,
  RL_RECENT_DISCARD_SLOTS,
  RL_RECENT_DISCARD_TOKEN_SIZE,
  RL_SEQUENCE_FEATURE_OFFSET,
  RL_TEACHER_FEATURE_INDEX,
} from './bot/rl-features.js';
export { enumerateLegalActionPlans } from './bot/legal-action-plans.js';
export type { AutomatedDecisionContext, LegalActionPlans } from './bot/legal-action-plans.js';
export { AutomationCycleGuard, automationStateFingerprint } from './bot/automation-cycle-guard.js';
export type { AutomationCycleGuardOptions } from './bot/automation-cycle-guard.js';
export { DIFFICULTY_PARAMS } from './bot/difficulty-params.js';
export {
  applyRoomSettingsPatch,
  isCurrentHouseRules,
  isCurrentHouseRulesPatch,
  isCurrentRoomSettings,
  isCurrentRoomSettingsPatch,
} from './room-settings-validation.js';
export type { DifficultyParams, DelayConfig } from './bot/difficulty-params.js';
export { PERSONALITY_WEIGHTS } from './bot/personality-weights.js';
export type { PersonalityWeights } from './bot/personality-weights.js';
export { evaluateCards, evaluateHandQuality, evaluateWinProximity } from './bot/card-evaluator.js';
export type { CardScore, CardScoreFactors } from './bot/card-evaluator.js';

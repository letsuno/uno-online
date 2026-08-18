import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import type { HouseRules } from '@uno-online/shared';

export const AI_FEATURE_SCHEMA = 'uno.rl.action-value.577.v1';

export const AI_PLUGIN_DATA_ACCESS = [
  'candidate-features',
  'public-state',
  'own-hand',
  'opponent-hands',
  'draw-piles',
  'chat-history',
] as const;

export type AiPluginDataAccess = (typeof AI_PLUGIN_DATA_ACCESS)[number];
export type AiPluginFairness = 'fair' | 'privileged' | 'cheat';

export interface AiCandidateInput {
  id: string;
  features: readonly number[];
  heuristicScore: number;
  teacherPreferred: boolean;
}

export interface AiDecisionRequest {
  decisionId: string;
  phase: string;
  playerCount: number;
  enabledHouseRules: readonly string[];
  featureSchema: typeof AI_FEATURE_SCHEMA;
  candidates: readonly AiCandidateInput[];
  communityData?: Readonly<Record<string, unknown>>;
  deadlineMs: number;
}

export interface AiProviderCapabilities {
  minPlayers: number;
  maxPlayers: number;
  supportedHouseRules: 'all' | readonly string[];
}

export interface AiProviderMetadata {
  id: string;
  displayName: string;
  version: string;
  source: 'builtin' | 'community';
  usesOnnx: boolean;
  dataAccess: readonly AiPluginDataAccess[];
  fairness: AiPluginFairness;
  capabilities: AiProviderCapabilities;
}

export interface AiValueDecision {
  kind: 'values';
  values: readonly number[];
}

export interface AiCandidateDecision {
  kind: 'candidate';
  candidateId: string;
}

export type AiProviderDecision = AiValueDecision | AiCandidateDecision;

export interface AiProvider {
  readonly metadata: AiProviderMetadata;
  decide(request: AiDecisionRequest, signal: AbortSignal): Promise<AiProviderDecision>;
  dispose(): Promise<void>;
}

export function enabledHouseRuleNames(houseRules: HouseRules): string[] {
  return Object.entries(houseRules)
    .filter(([name, value]) => value !== DEFAULT_HOUSE_RULES[name as keyof HouseRules])
    .map(([name]) => name);
}

export function providerSupportsContext(
  metadata: AiProviderMetadata,
  playerCount: number,
  enabledHouseRules: readonly string[],
): boolean {
  const { capabilities } = metadata;
  if (playerCount < capabilities.minPlayers || playerCount > capabilities.maxPlayers) return false;
  if (capabilities.supportedHouseRules === 'all') return true;
  const supported = new Set(capabilities.supportedHouseRules);
  return enabledHouseRules.every(rule => supported.has(rule));
}

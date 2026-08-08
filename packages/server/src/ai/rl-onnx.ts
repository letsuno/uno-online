import { randomUUID } from 'node:crypto';
import type { AutomationCycleGuard, GameAction, GameState } from '@uno-online/shared';
import {
  automationStateFingerprint,
  canonicalizeRlPlans,
  chooseBotAction,
  chooseFairRuleBotAction,
  encodeRlActionPlan,
  enumerateLegalActionPlans,
  heuristicRlPlanScore,
  rlPlanKey,
} from '@uno-online/shared';
import {
  AI_FEATURE_SCHEMA,
  enabledHouseRuleNames,
  providerSupportsContext,
  type AiCandidateInput,
  type AiDecisionRequest,
  type AiPluginDataAccess,
  type AiProvider,
  type AiProviderDecision,
} from './provider.js';
import {
  aiProviderRegistry,
} from './model-registry.js';

interface AiTurnDecision {
  actions: GameAction[];
  stateFingerprint: string;
}

const warnedFailures = new Set<string>();
const overdueProviderDecisions = new WeakMap<AiProvider, Set<Promise<AiProviderDecision>>>();

function warnOnce(key: string, error: unknown): void {
  if (warnedFailures.has(key)) return;
  warnedFailures.add(key);
  const message = error instanceof Error ? error.message : String(error);
  process.emitWarning(`AI provider ${key} unavailable; using fair rule fallback: ${message}`);
}

function readDecisionTimeoutMs(): number {
  const raw = process.env['UNO_AI_DECISION_TIMEOUT_MS'];
  if (raw === undefined) return 1_500;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 50 || parsed > 30_000) {
    throw new Error('UNO_AI_DECISION_TIMEOUT_MS must be an integer from 50 to 30000');
  }
  return parsed;
}

const AI_DECISION_TIMEOUT_MS = readDecisionTimeoutMs();

export function buildCommunityData(
  state: GameState,
  playerId: string,
  permissions: readonly AiPluginDataAccess[],
): Readonly<Record<string, unknown>> {
  const allowed = new Set(permissions);
  const data: Record<string, unknown> = {};
  if (allowed.has('public-state')) {
    data['publicState'] = {
      phase: state.phase,
      players: state.players.map(player => ({
        id: player.id,
        name: player.name,
        handCount: player.hand.length,
        score: player.score,
        roundWins: player.roundWins,
        connected: player.connected,
        autopilot: player.autopilot,
        calledUno: player.calledUno,
        unoCaught: player.unoCaught,
        eliminated: player.eliminated,
        teamId: player.teamId,
        isBot: player.isBot,
      })),
      currentPlayerIndex: state.currentPlayerIndex,
      direction: state.direction,
      deckLeftCount: state.deckLeft.length,
      deckRightCount: state.deckRight.length,
      deckLeftInitialCount: state.deckLeftInitialCount,
      deckRightInitialCount: state.deckRightInitialCount,
      discardPile: state.discardPile,
      currentColor: state.currentColor,
      drawStack: state.drawStack,
      pendingDrawPlayerId: state.pendingDrawPlayerId,
      pendingPenaltyDraws: state.pendingPenaltyDraws,
      pendingPenaltyNextPlayerIndex: state.pendingPenaltyNextPlayerIndex,
      pendingPenaltySourcePlayerId: state.pendingPenaltySourcePlayerId,
      pendingPenaltyQueue: state.pendingPenaltyQueue,
      pendingRevengeDraws: state.pendingRevengeDraws,
      lastAction: state.lastAction,
      roundNumber: state.roundNumber,
      winnerId: state.winnerId,
      settings: state.settings,
      gameStartedAt: state.gameStartedAt,
      turnStartedAt: state.turnStartedAt,
    };
  }
  if (allowed.has('own-hand')) {
    data['ownHand'] = state.players.find(player => player.id === playerId)?.hand ?? [];
  }
  if (allowed.has('opponent-hands')) {
    data['opponentHands'] = state.players
      .filter(player => player.id !== playerId)
      .map(player => ({ playerId: player.id, cards: player.hand }));
  }
  if (allowed.has('draw-piles')) {
    data['drawPiles'] = { left: state.deckLeft, right: state.deckRight };
  }
  if (allowed.has('chat-history')) {
    data['chatHistory'] = state.chatHistory ?? [];
  }
  return data;
}

function selectWithCycleGuard(
  state: GameState,
  preferred: GameAction[],
  legal: readonly GameAction[][],
  cycleGuard?: AutomationCycleGuard,
): GameAction[] {
  if (!cycleGuard || preferred.length === 0) return preferred;
  return cycleGuard.selectPlan(state, preferred, { plans: [...legal] });
}

function fallbackDecision(
  state: GameState,
  playerId: string,
  legal: readonly GameAction[][],
  stateFingerprint: string,
  cycleGuard?: AutomationCycleGuard,
): AiTurnDecision {
  const preferred = chooseFairRuleBotAction(state, playerId);
  const actions = selectWithCycleGuard(state, preferred, legal, cycleGuard);
  return { actions, stateFingerprint };
}

async function predictWithDeadline(
  provider: AiProvider,
  request: AiDecisionRequest,
): Promise<AiProviderDecision> {
  if ((overdueProviderDecisions.get(provider)?.size ?? 0) > 0) {
    throw new Error('a timed-out AI decision is still running');
  }

  const controller = new AbortController();
  const decision = provider.decide(request, controller.signal);
  void decision.then(
    () => {
      const overdue = overdueProviderDecisions.get(provider);
      overdue?.delete(decision);
      if (overdue?.size === 0) overdueProviderDecisions.delete(provider);
    },
    () => {
      const overdue = overdueProviderDecisions.get(provider);
      overdue?.delete(decision);
      if (overdue?.size === 0) overdueProviderDecisions.delete(provider);
    },
  );

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const overdue = overdueProviderDecisions.get(provider) ?? new Set();
      overdue.add(decision);
      overdueProviderDecisions.set(provider, overdue);
      controller.abort();
      reject(new Error(`AI decision exceeded ${request.deadlineMs}ms deadline`));
    }, request.deadlineMs);
    timeout.unref?.();
  });
  try {
    return await Promise.race([
      decision,
      timeoutPromise,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function chooseBotActionWithAi(
  state: GameState,
  playerId: string,
  cycleGuard?: AutomationCycleGuard,
): Promise<AiTurnDecision> {
  const decisionId = randomUUID();
  const stateFingerprint = automationStateFingerprint(state);
  const player = state.players.find(candidate => candidate.id === playerId);
  if (player?.botConfig?.difficulty !== 'rl') {
    const actions = chooseBotAction(state, playerId, cycleGuard);
    return { actions, stateFingerprint };
  }

  const legal = canonicalizeRlPlans(
    enumerateLegalActionPlans(state, playerId, { kind: 'turn' }).plans,
  );
  if (legal.length === 0) {
    return { actions: [], stateFingerprint };
  }

  const teacherKey = rlPlanKey(chooseFairRuleBotAction(state, playerId));
  const candidates: AiCandidateInput[] = legal.map(plan => {
    const id = rlPlanKey(plan);
    const teacherPreferred = id === teacherKey;
    return {
      id,
      features: encodeRlActionPlan(state, playerId, plan, teacherPreferred),
      heuristicScore: heuristicRlPlanScore(state, playerId, plan),
      teacherPreferred,
    };
  });

  const provider = await aiProviderRegistry.get(player.botConfig.aiProviderId);
  if (!provider) {
    return fallbackDecision(
      state,
      playerId,
      legal,
      stateFingerprint,
      cycleGuard,
    );
  }

  const request: AiDecisionRequest = {
    decisionId,
    phase: state.phase,
    playerCount: state.players.length,
    enabledHouseRules: enabledHouseRuleNames(state.settings.houseRules),
    featureSchema: AI_FEATURE_SCHEMA,
    candidates,
    ...(provider.metadata.source === 'community'
      ? { communityData: buildCommunityData(state, playerId, provider.metadata.dataAccess) }
      : {}),
    deadlineMs: AI_DECISION_TIMEOUT_MS,
  };
  if (!providerSupportsContext(provider.metadata, request.playerCount, request.enabledHouseRules)) {
    return fallbackDecision(
      state,
      playerId,
      legal,
      stateFingerprint,
      cycleGuard,
    );
  }

  let providerDecision: AiProviderDecision;
  try {
    providerDecision = await predictWithDeadline(provider, request);
    if (providerDecision.kind === 'values'
      && providerDecision.values.length !== candidates.length) {
      throw new Error('provider returned wrong value count');
    }
  } catch (error) {
    warnOnce(provider.metadata.id, error);
    return fallbackDecision(
      state,
      playerId,
      legal,
      stateFingerprint,
      cycleGuard,
    );
  }

  let selectedIndex: number;
  if (providerDecision.kind === 'candidate') {
    selectedIndex = candidates.findIndex(candidate => candidate.id === providerDecision.candidateId);
    if (selectedIndex < 0) {
      return fallbackDecision(
        state,
        playerId,
        legal,
        stateFingerprint,
        cycleGuard,
      );
    }
  } else {
    const values = providerDecision.values;
    selectedIndex = 0;
    for (let index = 1; index < values.length; index++) {
      if (values[index]! > values[selectedIndex]!) selectedIndex = index;
    }
  }
  const actions = selectWithCycleGuard(state, legal[selectedIndex]!, legal, cycleGuard);
  return { actions, stateFingerprint };
}

export async function isAiProviderCompatible(
  providerId: string,
  playerCount: number,
  houseRules: GameState['settings']['houseRules'],
): Promise<boolean> {
  const provider = await aiProviderRegistry.get(providerId);
  return provider !== null && providerSupportsContext(
    provider.metadata,
    playerCount,
    enabledHouseRuleNames(houseRules),
  );
}

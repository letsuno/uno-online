import type { GameAction, GameState } from '../../types/game.js';
import { applyActionWithHouseRules } from '../house-rules-engine.js';

interface LegalActionSet {
  plans: GameAction[][];
}

interface TransitionBucket {
  afterVisits: Map<string, number>;
}

export interface AutomationCycleGuardOptions {
  /**
   * Permit this many identical observed transitions before avoiding the plan.
   * Two visits preserve an initial tactic and one legitimate recurrence while
   * still breaking a deterministic loop promptly.
   */
  repeatLimit?: number;
  /** Bound memory for long rounds and persistent server sessions. */
  maxTransitions?: number;
}

const DEFAULT_REPEAT_LIMIT = 2;
const DEFAULT_MAX_TRANSITIONS = 8_192;

function hashExactState(value: unknown): string {
  const text = JSON.stringify(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  let h3 = 0x85ebca6b;
  let h4 = 0xc2b2ae35;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x27d4eb2d);
    h3 = Math.imul(h3 ^ code, 0x165667b1);
    h4 = Math.imul(h4 ^ code, 0x9e3779b1);
  }
  return [h1, h2, h3, h4].map(hash => (hash >>> 0).toString(16).padStart(8, '0')).join('');
}

/**
 * Deterministic 128-bit fingerprint of the rule-relevant exact game state.
 *
 * House rules and player configuration are constant during a round, so they
 * do not need to be duplicated in every transition key.
 */
export function automationStateFingerprint(state: GameState): string {
  return hashExactState({
    phase: state.phase,
    players: state.players.map(player => ({
      id: player.id,
      hand: player.hand.map(card => card.id),
      score: player.score,
      calledUno: player.calledUno,
      eliminated: player.eliminated,
      teamId: player.teamId ?? null,
    })),
    currentPlayerIndex: state.currentPlayerIndex,
    direction: state.direction,
    deckLeft: state.deckLeft.map(card => card.id),
    deckRight: state.deckRight.map(card => card.id),
    discardPile: state.discardPile.map(card => card.id),
    currentColor: state.currentColor,
    drawStack: state.drawStack,
    pendingDrawPlayerId: state.pendingDrawPlayerId,
    pendingPenaltyDraws: state.pendingPenaltyDraws,
    pendingPenaltyNextPlayerIndex: state.pendingPenaltyNextPlayerIndex,
    pendingPenaltySourcePlayerId: state.pendingPenaltySourcePlayerId,
    pendingPenaltyQueue: state.pendingPenaltyQueue,
    pendingRevengeDraws: state.pendingRevengeDraws,
    lastAction: state.lastAction,
  });
}

function actionSignature(action: GameAction): unknown {
  switch (action.type) {
    case 'PLAY_CARD':
      return [action.type, action.playerId, action.cardId, action.chosenColor ?? null, action.isJumpIn ?? false];
    case 'DRAW_CARD':
      return [action.type, action.playerId, action.side];
    case 'PASS':
    case 'CALL_UNO':
    case 'CHALLENGE':
    case 'ACCEPT':
      return [action.type, action.playerId];
    case 'CATCH_UNO':
      return [action.type, action.catcherId, action.targetId];
    case 'CHOOSE_COLOR':
      return [action.type, action.playerId, action.color];
    case 'CHOOSE_SWAP_TARGET':
      return [action.type, action.playerId, action.targetId];
  }
}

function planSignature(plan: readonly GameAction[]): string {
  return JSON.stringify(plan.map(actionSignature));
}

/**
 * A bounded, automation-only cycle guard.
 *
 * It never changes engine legality. A plan is avoided only after either its
 * exact transition edge or its predicted exact after-state has already been
 * observed `repeatLimit` times in the current round. Tracking the destination
 * independently matters when several predecessor states converge into the
 * same deterministic loop. First-use tactics remain legal, including
 * immediately replaying a recycled action card.
 */
export class AutomationCycleGuard {
  private readonly repeatLimit: number;
  private readonly maxTransitions: number;
  private readonly transitions = new Map<string, TransitionBucket>();
  private readonly stateVisits = new Map<string, number>();
  private roundNumber: number | null = null;
  private lastAfterFingerprint: string | null = null;

  constructor(options: AutomationCycleGuardOptions = {}) {
    this.repeatLimit = Math.max(1, options.repeatLimit ?? DEFAULT_REPEAT_LIMIT);
    this.maxTransitions = Math.max(1, options.maxTransitions ?? DEFAULT_MAX_TRANSITIONS);
  }

  reset(): void {
    this.transitions.clear();
    this.stateVisits.clear();
    this.roundNumber = null;
    this.lastAfterFingerprint = null;
  }

  private syncRound(state: GameState): void {
    if (this.roundNumber === null) {
      this.roundNumber = state.roundNumber;
      return;
    }
    if (this.roundNumber !== state.roundNumber) {
      this.transitions.clear();
      this.stateVisits.clear();
      this.roundNumber = state.roundNumber;
      this.lastAfterFingerprint = null;
    }
  }

  private key(state: GameState, plan: readonly GameAction[]): string {
    return `${automationStateFingerprint(state)}:${planSignature(plan)}`;
  }

  private planAfterFingerprint(state: GameState, plan: readonly GameAction[]): string | null {
    let after = state;
    for (const action of plan) {
      const next = applyActionWithHouseRules(after, action);
      if (next === after) return null;
      after = next;
    }
    return automationStateFingerprint(after);
  }

  private boundedIncrement(visits: Map<string, number>, fingerprint: string): void {
    const next = (visits.get(fingerprint) ?? 0) + 1;
    // Refresh insertion order so the bounded map represents recent states,
    // not merely the first states observed in a very long round.
    visits.delete(fingerprint);
    if (visits.size >= this.maxTransitions) {
      const oldest = visits.keys().next().value as string | undefined;
      if (oldest !== undefined) visits.delete(oldest);
    }
    visits.set(fingerprint, next);
  }

  private repeatCountForAfter(state: GameState, plan: readonly GameAction[], afterFingerprint: string | null): number {
    if (plan.length === 0) return 0;
    this.syncRound(state);
    const bucket = this.transitions.get(this.key(state, plan));
    let edgeMax = 0;
    if (bucket) {
      for (const visits of bucket.afterVisits.values()) {
        edgeMax = Math.max(edgeMax, visits);
      }
    }
    const stateCount = afterFingerprint === null ? 0 : (this.stateVisits.get(afterFingerprint) ?? 0);
    return Math.max(edgeMax, stateCount);
  }

  repeatCount(state: GameState, plan: readonly GameAction[]): number {
    return this.repeatCountForAfter(state, plan, this.planAfterFingerprint(state, plan));
  }

  shouldAvoidPlan(state: GameState, plan: readonly GameAction[]): boolean {
    return this.repeatCount(state, plan) >= this.repeatLimit;
  }

  recordTransition(before: GameState, plan: readonly GameAction[], after: GameState): void {
    if (plan.length === 0) return;
    this.syncRound(before);
    if (after.roundNumber !== before.roundNumber) {
      this.transitions.clear();
      this.stateVisits.clear();
      this.roundNumber = after.roundNumber;
      this.lastAfterFingerprint = null;
      return;
    }

    const beforeFingerprint = automationStateFingerprint(before);
    if (beforeFingerprint !== this.lastAfterFingerprint) {
      this.boundedIncrement(this.stateVisits, beforeFingerprint);
    }

    const key = this.key(before, plan);
    let bucket = this.transitions.get(key);
    if (!bucket) {
      if (this.transitions.size >= this.maxTransitions) {
        const oldestKey = this.transitions.keys().next().value as string | undefined;
        if (oldestKey !== undefined) this.transitions.delete(oldestKey);
      }
      bucket = { afterVisits: new Map<string, number>() };
      this.transitions.set(key, bucket);
    }
    const afterFingerprint = automationStateFingerprint(after);
    bucket.afterVisits.set(afterFingerprint, (bucket.afterVisits.get(afterFingerprint) ?? 0) + 1);
    this.boundedIncrement(this.stateVisits, afterFingerprint);
    this.lastAfterFingerprint = afterFingerprint;
  }

  /**
   * Remove only plans with demonstrated repeated transitions. If every legal
   * plan is repeated, preserve the original set so callers never receive an
   * artificial zero-action state.
   */
  filterLegalActions<T extends LegalActionSet>(state: GameState, legal: T): T {
    const avoid = legal.plans.map(plan => {
      const afterFingerprint = this.planAfterFingerprint(state, plan);
      return this.repeatCountForAfter(state, plan, afterFingerprint) >= this.repeatLimit;
    });
    const hasAllowedPlan = legal.plans.some((_, index) => !avoid[index]);
    if (!hasAllowedPlan || !avoid.some(Boolean)) return legal;
    return {
      ...legal,
      plans: legal.plans.filter((_, index) => !avoid[index]),
    };
  }

  /**
   * Keep a chooser's preferred plan unless it has demonstrated recurrence.
   * On intervention, choose the least-repeated remaining engine-legal plan.
   */
  selectPlan<T extends LegalActionSet>(state: GameState, preferred: GameAction[], legal: T): GameAction[] {
    if (preferred.length === 0 || !this.shouldAvoidPlan(state, preferred)) {
      return preferred;
    }

    const filtered = this.filterLegalActions(state, legal);
    let selected: GameAction[] | null = null;
    let selectedCount = Number.POSITIVE_INFINITY;
    for (const plan of filtered.plans) {
      const afterFingerprint = this.planAfterFingerprint(state, plan);
      const count = this.repeatCountForAfter(state, plan, afterFingerprint);
      if (count < selectedCount) {
        selected = plan;
        selectedCount = count;
      }
    }
    return selected ?? preferred;
  }
}

import { describe, expect, it } from 'vitest';
import { DEFAULT_HOUSE_RULES } from '../../src/types/house-rules.js';
import { chooseAutopilotAction } from '../../src/rules/autopilot-strategy.js';
import { AutomationCycleGuard } from '../../src/rules/bot/automation-cycle-guard.js';
import { enumerateLegalActionPlans } from '../../src/rules/bot/legal-action-plans.js';
import { applyActionWithHouseRules } from '../../src/rules/house-rules-engine.js';
import { makeCard, makeState } from '../helpers/test-utils.js';

function recycledActionCardState() {
  const recycledSkip = makeCard('skip', 'red', { id: 'recycled-skip' });
  return {
    recycledSkip,
    state: makeState({
      currentPlayerIndex: 0,
      currentColor: 'red',
      deckLeft: [],
      deckRight: [],
      discardPile: [makeCard('number', 'red', { value: 5, id: 'top-red-5' })],
      lastAction: { type: 'DRAW_CARD', playerId: 'p1', side: 'left' },
      players: [
        {
          id: 'p1',
          name: 'Alice',
          hand: [
            recycledSkip,
            makeCard('number', 'red', { value: 7, id: 'red-7' }),
            makeCard('number', 'green', { value: 2, id: 'green-2' }),
          ],
          score: 0,
          connected: true,
          autopilot: true,
          calledUno: false,
        },
        {
          id: 'p2',
          name: 'Bob',
          hand: [makeCard('number', 'yellow', { value: 4, id: 'yellow-4' })],
          score: 0,
          connected: true,
          autopilot: false,
          calledUno: false,
        },
      ],
      settings: {
        turnTimeLimit: 30,
        targetScore: 500,
        allowSpectators: true,
        spectatorMode: 'hidden',
        houseRules: {
          ...DEFAULT_HOUSE_RULES,
          drawUntilPlayable: true,
        },
      },
    }),
  };
}

describe('AutomationCycleGuard', () => {
  it('allows two identical tactics and avoids only the demonstrated third transition', () => {
    const { state, recycledSkip } = recycledActionCardState();
    const guard = new AutomationCycleGuard();
    const preferred = [
      {
        type: 'PLAY_CARD' as const,
        playerId: 'p1',
        cardId: recycledSkip.id,
      },
    ];
    const after = applyActionWithHouseRules(state, preferred[0]!);

    expect(after).not.toBe(state);
    expect(guard.shouldAvoidPlan(state, preferred)).toBe(false);
    expect(chooseAutopilotAction(state, 'p1', guard)).toEqual(preferred);

    guard.recordTransition(state, preferred, after);
    expect(guard.shouldAvoidPlan(state, preferred)).toBe(false);
    expect(chooseAutopilotAction(state, 'p1', guard)).toEqual(preferred);

    guard.recordTransition(state, preferred, after);
    expect(guard.shouldAvoidPlan(state, preferred)).toBe(true);

    const legal = enumerateLegalActionPlans(state, 'p1', { kind: 'turn' });
    const filtered = guard.filterLegalActions(state, legal);
    expect(filtered.plans).not.toContainEqual(preferred);
    expect(filtered.plans).toContainEqual([
      {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: state.players[0]!.hand[1]!.id,
      },
    ]);
    expect(filtered.plans).toContainEqual([{ type: 'PASS', playerId: 'p1' }]);

    const guardedChoice = chooseAutopilotAction(state, 'p1', guard);
    expect(guardedChoice).not.toEqual(preferred);
    expect(guardedChoice.length).toBeGreaterThan(0);

    // The rules engine and therefore a human player retain the original move.
    expect(applyActionWithHouseRules(state, preferred[0]!)).not.toBe(state);
  });

  it('avoids convergence to a repeated after-state from a different before-state', () => {
    const { state, recycledSkip } = recycledActionCardState();
    const guard = new AutomationCycleGuard();
    const plan = [
      {
        type: 'PLAY_CARD' as const,
        playerId: 'p1',
        cardId: recycledSkip.id,
      },
    ];
    const secondBefore = {
      ...state,
      lastAction: { type: 'DRAW_CARD' as const, playerId: 'p1', side: 'right' as const },
    };
    const firstAfter = applyActionWithHouseRules(state, plan[0]!);
    const secondAfter = applyActionWithHouseRules(secondBefore, plan[0]!);
    expect(firstAfter).toEqual(secondAfter);

    // Neither exact edge repeats: two distinct predecessor states converge on
    // one destination, matching the production low-deck failure geometry.
    guard.recordTransition(state, plan, firstAfter);
    expect(guard.shouldAvoidPlan(secondBefore, plan)).toBe(false);
    guard.recordTransition(secondBefore, plan, secondAfter);

    const thirdBefore = {
      ...state,
      lastAction: { type: 'PASS' as const, playerId: 'p2' },
    };
    expect(applyActionWithHouseRules(thirdBefore, plan[0]!)).toEqual(firstAfter);
    expect(guard.shouldAvoidPlan(thirdBefore, plan)).toBe(true);
    expect(chooseAutopilotAction(thirdBefore, 'p1', guard)).not.toEqual(plan);

    const differentAfterState = {
      ...thirdBefore,
      players: thirdBefore.players.map((player, index) => (index === 1 ? { ...player, calledUno: true } : player)),
    };
    expect(guard.shouldAvoidPlan(differentAfterState, plan)).toBe(false);
    expect(chooseAutopilotAction(differentAfterState, 'p1', guard)).toEqual(plan);
  });

  it('resets bounded history when the round number changes', () => {
    const { state, recycledSkip } = recycledActionCardState();
    const guard = new AutomationCycleGuard();
    const plan = [
      {
        type: 'PLAY_CARD' as const,
        playerId: 'p1',
        cardId: recycledSkip.id,
      },
    ];
    const after = applyActionWithHouseRules(state, plan[0]!);
    guard.recordTransition(state, plan, after);
    guard.recordTransition(state, plan, after);
    expect(guard.shouldAvoidPlan(state, plan)).toBe(true);

    const nextRoundState = { ...state, roundNumber: state.roundNumber + 1 };
    expect(guard.shouldAvoidPlan(nextRoundState, plan)).toBe(false);
  });
});

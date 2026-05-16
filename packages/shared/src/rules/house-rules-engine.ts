import type { GameState, GameAction } from '../types/game.js';
import { applyAction, drainPenaltyQueue } from './game-engine.js';
import { buildRuleContext } from './house-rule-helpers.js';
import { PRE_CHECK_PLUGINS, POST_PROCESS_PLUGINS } from './rules/index.js';

const ctx = buildRuleContext();

function runPostProcess(state: GameState, next: GameState, action: GameAction, hr: GameState['settings']['houseRules']): GameState {
  for (const plugin of POST_PROCESS_PLUGINS) {
    if (!plugin.isEnabled(hr)) continue;
    if (!plugin.postProcess) continue;
    next = plugin.postProcess(state, next, action, ctx);
  }
  return next;
}

const TERMINAL_PHASES = new Set(['round_end', 'game_over']);

export function applyActionWithHouseRules(state: GameState, action: GameAction): GameState {
  const hr = state.settings.houseRules;

  for (const plugin of PRE_CHECK_PLUGINS) {
    if (!plugin.isEnabled(hr)) continue;
    if (!plugin.preCheck) continue;
    const result = plugin.preCheck(state, action, ctx);
    if (result.handled) {
      let next = drainPenaltyQueue(result.state);
      if (next !== state && TERMINAL_PHASES.has(next.phase) && !TERMINAL_PHASES.has(state.phase)) {
        next = runPostProcess(state, next, action, hr);
      }
      return next;
    }
  }

  if (
    action.type === 'DRAW_CARD' &&
    (state.pendingPenaltyDraws ?? 0) === 0 &&
    state.lastAction?.type === 'DRAW_CARD' &&
    state.lastAction.playerId === action.playerId
  ) {
    return state;
  }

  let next = applyAction(state, action);
  return runPostProcess(state, next, action, hr);
}

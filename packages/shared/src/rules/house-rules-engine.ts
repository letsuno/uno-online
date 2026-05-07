import type { GameState, GameAction } from '../types/game';
import { applyAction } from './game-engine';
import { buildRuleContext } from './house-rule-helpers';
import { PRE_CHECK_PLUGINS, POST_PROCESS_PLUGINS } from './rules/index';

const ctx = buildRuleContext();

export function applyActionWithHouseRules(state: GameState, action: GameAction): GameState {
  const hr = state.settings.houseRules;

  for (const plugin of PRE_CHECK_PLUGINS) {
    if (!plugin.isEnabled(hr)) continue;
    if (!plugin.preCheck) continue;
    const result = plugin.preCheck(state, action, ctx);
    if (result.handled) return result.state;
  }

  let next = applyAction(state, action);

  for (const plugin of POST_PROCESS_PLUGINS) {
    if (!plugin.isEnabled(hr)) continue;
    if (!plugin.postProcess) continue;
    next = plugin.postProcess(state, next, action, ctx);
  }

  return next;
}

import { canJumpIn } from '@uno-online/shared';
import type { GameState } from '@uno-online/shared';

export function getAutopilotActionPlayerId(state: GameState): string | null {
  if (state.phase === 'round_end' || state.phase === 'game_over') return null;
  if (state.phase === 'challenging') return state.pendingDrawPlayerId ?? null;
  return state.players[state.currentPlayerIndex]?.id ?? null;
}

export function canPlayerAutopilotOnce(state: GameState, playerId: string): boolean {
  return getAutopilotActionPlayerId(state) === playerId || canJumpIn(state, playerId);
}

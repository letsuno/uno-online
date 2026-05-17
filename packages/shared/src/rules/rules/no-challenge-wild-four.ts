import type { HouseRulePlugin } from '../house-rule-types.js';
import type { GameState, GameAction } from '../../types/game.js';
import type { PreCheckResult, RuleContext } from '../house-rule-types.js';

export const noChallengeWildFour: HouseRulePlugin = {
  meta: {
    id: 'no-challenge-wild-four',
    keys: ['noChallengeWildFour'],
    label: '无质疑 +4',
    description: '关闭 +4 质疑机制',
  },
  isEnabled: (hr) => hr.noChallengeWildFour,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (
      action.type === 'CHOOSE_COLOR' &&
      state.phase === 'choosing_color' &&
      state.pendingDrawPlayerId !== null
    ) {
      const wd4Player = state.players[state.currentPlayerIndex];
      if (wd4Player?.id !== action.playerId) return { handled: false };

      const afterColor = ctx.applyAction(state, action);
      if (afterColor.phase !== 'challenging' || afterColor.pendingDrawPlayerId === null) {
        return { handled: true, state: afterColor };
      }

      const penaltyPlayerId = afterColor.pendingDrawPlayerId;
      const penaltyPlayerIndex = afterColor.players.findIndex(p => p.id === penaltyPlayerId);
      if (penaltyPlayerIndex === -1) return { handled: true, state: afterColor };

      const nextPlayerIndex = ctx.getNextPlayerIndex(
        penaltyPlayerIndex,
        afterColor.players.length,
        afterColor.direction,
      );

      return {
        handled: true,
        state: ctx.startPenaltyDraw(
          {
            ...afterColor,
            phase: 'playing',
            pendingDrawPlayerId: null,
          },
          penaltyPlayerId,
          4,
          nextPlayerIndex,
          wd4Player.id,
        ),
      };
    }

    if (action.type !== 'CHALLENGE') return { handled: false };
    return { handled: true, state };
  },
};

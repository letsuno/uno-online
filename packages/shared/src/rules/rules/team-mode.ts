import type { HouseRulePlugin } from '../house-rule-types.js';
import type { GameState, GameAction } from '../../types/game.js';
import type { RuleContext } from '../house-rule-types.js';

export const teamMode: HouseRulePlugin = {
  meta: {
    id: 'team-mode',
    keys: ['teamMode'],
    label: '团队模式',
    description: '偶数玩家时对面是队友',
  },
  isEnabled: hr => hr.teamMode,
  postProcess: (before: GameState, after: GameState, _action: GameAction, _ctx: RuleContext): GameState => {
    if (
      !(after.phase === 'round_end' || after.phase === 'game_over') ||
      before.phase !== 'playing' ||
      after.winnerId === null
    ) {
      return after;
    }

    const winner = after.players.find(p => p.id === after.winnerId);
    if (!winner) {
      throw new Error(`Round winner is missing from player state: ${after.winnerId}`);
    }
    if (winner.teamId === undefined) return after;

    const winnerBefore = before.players.find(p => p.id === winner.id);
    if (!winnerBefore) {
      throw new Error(`Round winner is missing from previous player state: ${winner.id}`);
    }
    const earned = winner.score - winnerBefore.score;
    if (earned <= 0) return after;

    const players = after.players.map(p => {
      if (p.teamId === winner.teamId && p.id !== winner.id) {
        return { ...p, score: p.score + earned };
      }
      return p;
    });
    return { ...after, players };
  },
};

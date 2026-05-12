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
  isEnabled: (hr) => hr.teamMode,
  postProcess: (before: GameState, after: GameState, _action: GameAction, _ctx: RuleContext): GameState => {
    if (
      !(after.phase === 'round_end' || after.phase === 'game_over') ||
      before.phase !== 'playing' ||
      !after.winnerId
    ) {
      return after;
    }

    const winner = after.players.find(p => p.id === after.winnerId);
    if (winner?.teamId === undefined) return after;

    const earned = (winner.score) - (before.players.find(p => p.id === winner.id)?.score ?? 0);
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

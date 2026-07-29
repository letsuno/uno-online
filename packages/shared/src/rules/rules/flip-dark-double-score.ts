import type { HouseRulePlugin } from '../house-rule-types.js';
import type { GameState, GameAction } from '../../types/game.js';
import type { RuleContext } from '../house-rule-types.js';

/**
 * 村规「暗面结算翻倍」：本轮在暗面结束时，赢家得分翻倍。
 *
 * 与 `doubleScore` 相互独立——两条都开时会各翻一次（合计 4 倍），这是有意的：
 * 玩家分别开启两条规则时期望它们叠加。
 */
export const flipDarkDoubleScore: HouseRulePlugin = {
  meta: {
    id: 'flip-dark-double-score',
    keys: ['flipDarkDoubleScore'],
    label: '暗面结算翻倍',
    description: '在暗面结束的回合，赢家得分翻倍',
  },
  isEnabled: (hr) => hr.flipDarkDoubleScore,
  postProcess: (before: GameState, after: GameState, _action: GameAction, _ctx: RuleContext): GameState => {
    if (after.flipSide !== 'dark') return after;
    if (!(after.phase === 'round_end' || after.phase === 'game_over')) return after;
    if (before.phase !== 'playing' || after.winnerId === null) return after;

    const winnerId = after.winnerId;
    const beforeScore = before.players.find(p => p.id === winnerId)?.score ?? 0;
    const afterScore = after.players.find(p => p.id === winnerId)?.score ?? 0;
    const earned = afterScore - beforeScore;
    if (earned <= 0) return after;

    return {
      ...after,
      players: after.players.map(p =>
        p.id === winnerId ? { ...p, score: beforeScore + earned * 2 } : p,
      ),
    };
  },
};

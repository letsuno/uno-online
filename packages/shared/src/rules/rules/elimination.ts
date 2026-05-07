import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext } from '../house-rule-types';

export const elimination: HouseRulePlugin = {
  meta: {
    id: 'elimination',
    keys: ['elimination'],
    label: '淘汰制',
    description: '每轮结束手牌最多者被淘汰',
  },
  isEnabled: (hr) => hr.elimination,
  postProcess: (before: GameState, after: GameState, _action: GameAction, _ctx: RuleContext): GameState => {
    if (after.phase !== 'round_end' || before.phase === 'round_end') return after;

    const nonEliminated = after.players.filter(p => !p.eliminated);
    if (nonEliminated.length <= 1) return after;

    const nonWinners = nonEliminated.filter(p => p.id !== after.winnerId);
    let maxCards = 0;
    let loser: typeof nonWinners[0] | null = null;
    for (const p of nonWinners) {
      if (p.hand.length > maxCards) {
        maxCards = p.hand.length;
        loser = p;
      }
    }
    if (!loser) return after;

    const players = after.players.map(p =>
      p.id === loser!.id ? { ...p, eliminated: true } : p,
    );
    const remaining = players.filter(p => !p.eliminated);
    if (remaining.length <= 1) {
      return { ...after, players, phase: 'game_over', winnerId: remaining[0]?.id ?? after.winnerId };
    }
    return { ...after, players };
  },
};

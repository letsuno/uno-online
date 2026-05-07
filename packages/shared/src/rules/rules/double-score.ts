import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext } from '../house-rule-types';

export const doubleScore: HouseRulePlugin = {
  meta: {
    id: 'double-score',
    keys: ['doubleScore'],
    label: '积分翻倍',
    description: '赢家分数翻倍',
  },
  isEnabled: (hr) => hr.doubleScore,
  postProcess: (_before: GameState, after: GameState, _action: GameAction, ctx: RuleContext): GameState => {
    return ctx.applyDoubleScore(_before, after);
  },
};

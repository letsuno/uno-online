import type { HouseRulePlugin } from '../house-rule-types.js';
import type { GameState, GameAction } from '../../types/game.js';
import type { RuleContext } from '../house-rule-types.js';

export const zeroRotate: HouseRulePlugin = {
  meta: {
    id: 'zero-rotate',
    keys: ['zeroRotateHands'],
    label: '0 牌交换手牌',
    description: '打出 0 时所有人按方向传递手牌',
  },
  isEnabled: (hr) => hr.zeroRotateHands,
  postProcess: (before: GameState, after: GameState, action: GameAction, _ctx: RuleContext): GameState => {
    if (action.type !== 'PLAY_CARD') return after;
    if (after === before) return after;
    const playedCard = before.players[before.currentPlayerIndex]?.hand.find(c => c.id === action.cardId);
    if (playedCard?.type !== 'number' || playedCard.value !== 0) return after;

    const hands = after.players.map(p => [...p.hand]);
    const rotated = after.players.map((p, i) => {
      const sourceIdx = after.direction === 'clockwise'
        ? (i - 1 + after.players.length) % after.players.length
        : (i + 1) % after.players.length;
      return { ...p, hand: hands[sourceIdx]! };
    });
    return { ...after, players: rotated };
  },
};

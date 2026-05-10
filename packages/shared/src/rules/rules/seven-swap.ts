import type { HouseRulePlugin } from '../house-rule-types';
import type { GameState, GameAction } from '../../types/game';
import type { RuleContext, PreCheckResult } from '../house-rule-types';

export const sevenSwapPost: HouseRulePlugin = {
  meta: {
    id: 'seven-swap-post',
    keys: ['sevenSwapHands'],
    label: '7 牌交换',
    description: '打出 7 时与下家交换手牌',
  },
  isEnabled: (hr) => hr.sevenSwapHands,
  postProcess: (before: GameState, after: GameState, action: GameAction, _ctx: RuleContext): GameState => {
    if (action.type !== 'PLAY_CARD') return after;
    if (after === before) return after;
    const playedCard = before.players[before.currentPlayerIndex]?.hand.find(c => c.id === action.cardId);
    if (playedCard?.type !== 'number' || playedCard.value !== 7) return after;
    return { ...after, phase: 'choosing_swap_target' as any, currentPlayerIndex: before.currentPlayerIndex };
  },
};

export const sevenSwapTarget: HouseRulePlugin = {
  meta: {
    id: 'seven-swap-target',
    keys: ['sevenSwapHands'],
    label: '7 牌交换（选择目标）',
    description: '打出 7 时选择交换手牌的目标',
  },
  isEnabled: (hr) => hr.sevenSwapHands,
  preCheck: (state: GameState, action: GameAction, ctx: RuleContext): PreCheckResult => {
    if (action.type !== 'CHOOSE_SWAP_TARGET') return { handled: false };
    if (state.phase !== 'choosing_swap_target') return { handled: true, state };
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== action.playerId) return { handled: true, state };
    const targetIdx = state.players.findIndex(p => p.id === action.targetId);
    if (targetIdx === -1 || targetIdx === state.currentPlayerIndex) return { handled: true, state };
    const currentHand = [...state.players[state.currentPlayerIndex]!.hand];
    const targetHand = [...state.players[targetIdx]!.hand];
    const players = state.players.map((p, i) => {
      if (i === state.currentPlayerIndex) return { ...p, hand: targetHand, calledUno: targetHand.length === 1, unoCaught: false };
      if (i === targetIdx) return { ...p, hand: currentHand, calledUno: currentHand.length === 1, unoCaught: false };
      return p;
    });
    const nextIdx = ctx.getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction);
    return { handled: true, state: { ...state, players, phase: 'playing', currentPlayerIndex: nextIdx, lastAction: action } };
  },
};

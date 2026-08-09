import type { Card, CardType, Color } from '../../types/card.js';
import type { GameAction, GameState, Player } from '../../types/game.js';
import { canPlayCard } from '../validation.js';
import { getNextAliveIndex } from '../turn.js';

const COLORS: readonly Color[] = ['red', 'blue', 'green', 'yellow'];
const CARD_TYPES: readonly CardType[] = ['number', 'skip', 'reverse', 'draw_two', 'wild', 'wild_draw_four'];
const ACTION_KINDS = ['play', 'draw', 'pass', 'challenge', 'accept', 'choose_color', 'swap'] as const;
const NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const LAST_ACTION_TYPES = [
  'PLAY_CARD',
  'DRAW_CARD',
  'PASS',
  'CALL_UNO',
  'CATCH_UNO',
  'CHALLENGE',
  'ACCEPT',
  'CHOOSE_COLOR',
  'CHOOSE_SWAP_TARGET',
] as const;
const PUBLIC_CARD_COUNT_FEATURE_NAMES = [
  ...NUMBERS.map(value => `top_value_${value}` as const),
  ...NUMBERS.map(value => `action_value_${value}` as const),
  ...NUMBERS.map(value => `hand_value_fraction_${value}` as const),
  ...NUMBERS.map(value => `discard_value_fraction_${value}` as const),
  ...COLORS.map(color => `discard_color_fraction_${color}` as const),
  ...CARD_TYPES.map(type => `discard_type_fraction_${type}` as const),
  ...COLORS.map(color => `unseen_color_fraction_${color}` as const),
  ...CARD_TYPES.map(type => `unseen_type_fraction_${type}` as const),
  ...LAST_ACTION_TYPES.map(type => `last_action_${type.toLowerCase()}` as const),
] as const;

export const RL_RECENT_DISCARD_SLOTS = 16;
export const RL_RECENT_DISCARD_TOKEN_SIZE = 24;
const RECENT_DISCARD_SEQUENCE_FEATURE_NAMES = Array.from({ length: RL_RECENT_DISCARD_SLOTS }, (_, index) => {
  const slot = index + 1;
  return [
    ...COLORS.map(color => `recent_discard_${slot}_color_${color}`),
    ...CARD_TYPES.map(type => `recent_discard_${slot}_type_${type}`),
    ...NUMBERS.map(value => `recent_discard_${slot}_value_${value}`),
    ...COLORS.map(color => `recent_discard_${slot}_chosen_${color}`),
  ];
}).flat();

/** Keep this list ordered to match the bundled production ONNX schema. */
const HOUSE_RULE_FEATURE_NAMES = [
  'house_stack_draw_two',
  'house_stack_draw_four',
  'house_cross_stack',
  'house_reverse_deflect_draw_two',
  'house_reverse_deflect_draw_four',
  'house_skip_deflect',
  'house_zero_rotate_hands',
  'house_seven_swap_hands',
  'house_jump_in',
  'house_multiple_play_same_number',
  'house_wild_first_turn',
  'house_draw_until_playable',
  'house_forced_play_after_draw',
  'house_hand_limit',
  'house_forced_play',
  'house_hand_reveal_threshold',
  'house_uno_penalty_count',
  'house_strict_uno_call',
  'house_misplay_penalty',
  'house_fast_mode',
  'house_no_hints',
  'house_elimination',
  'house_blitz_time_limit',
  'house_revenge_mode',
  'house_silent_uno',
  'house_team_mode',
  'house_no_function_card_finish',
  'house_no_wild_finish',
  'house_double_score',
  'house_no_challenge_wild_four',
  'house_blind_draw',
  'house_bomb_card',
  'house_shuffle_seats',
  ...PUBLIC_CARD_COUNT_FEATURE_NAMES,
  ...RECENT_DISCARD_SEQUENCE_FEATURE_NAMES,
] as const;

export const RL_FEATURE_NAMES = [
  'alive_players',
  'total_players',
  'own_hand_size',
  'own_hand_share',
  'minimum_opponent_hand',
  'maximum_opponent_hand',
  'mean_opponent_hand',
  'next_player_hand',
  'leader_gap',
  'turn_distance_to_leader',
  'left_deck_size',
  'right_deck_size',
  'discard_size',
  'draw_stack',
  'pending_penalty',
  'clockwise',
  'score_progress',
  'round_progress',
  'phase_playing',
  'phase_challenging',
  'phase_choosing_color',
  'phase_choosing_swap_target',
  'current_color_red',
  'current_color_blue',
  'current_color_green',
  'current_color_yellow',
  'top_number',
  'top_skip',
  'top_reverse',
  'top_draw_two',
  'top_wild',
  'top_wild_draw_four',
  'hand_color_red',
  'hand_color_blue',
  'hand_color_green',
  'hand_color_yellow',
  'hand_number',
  'hand_skip',
  'hand_reverse',
  'hand_draw_two',
  'hand_wild',
  'hand_wild_draw_four',
  'playable_hand_fraction',
  'matching_top_value_fraction',
  'action_play',
  'action_draw',
  'action_pass',
  'action_challenge',
  'action_accept',
  'action_choose_color',
  'action_swap',
  'action_card_number',
  'action_card_skip',
  'action_card_reverse',
  'action_card_draw_two',
  'action_card_wild',
  'action_card_wild_draw_four',
  'action_card_red',
  'action_card_blue',
  'action_card_green',
  'action_card_yellow',
  'chosen_color_red',
  'chosen_color_blue',
  'chosen_color_green',
  'chosen_color_yellow',
  'cards_played',
  'hand_size_after_play',
  'immediate_finish',
  'matches_current_color',
  'matches_top_trait',
  'chosen_color_hand_fraction',
  'target_hand_size',
  'target_is_next_player',
  'draw_left',
  'draw_right',
  'is_jump_in',
  'plan_length',
  'rule_stacking',
  'rule_cross_stack',
  'rule_deflection',
  'rule_zero_rotate',
  'rule_seven_swap',
  'rule_jump_in',
  'rule_multiple_play',
  'rule_draw_until_playable',
  'rule_forced_after_draw',
  'rule_hand_limit',
  'rule_team_mode',
  'rule_finish_restriction',
  'rule_prior',
  ...HOUSE_RULE_FEATURE_NAMES,
  // The production ONNX model consumes this marker at index 576.
  'teacher_preferred',
] as const;

export const RL_FEATURE_COUNT = RL_FEATURE_NAMES.length;
export const RL_SEQUENCE_FEATURE_OFFSET = 192;
export const RL_TEACHER_FEATURE_INDEX = RL_FEATURE_NAMES.indexOf('teacher_preferred');

interface PlanSummary {
  kind: (typeof ACTION_KINDS)[number];
  card: Card | undefined;
  chosenColor: Color | undefined;
  target: Player | undefined;
  cardsPlayed: number;
  drawSide: 'left' | 'right' | undefined;
  isJumpIn: boolean;
}

function clamp(value: number, min = -1, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function ratio(value: number, denominator: number): number {
  return denominator > 0 ? clamp(value / denominator, 0, 1) : 0;
}

function actionKind(action: GameAction): PlanSummary['kind'] {
  switch (action.type) {
    case 'PLAY_CARD':
      return 'play';
    case 'DRAW_CARD':
      return 'draw';
    case 'PASS':
      return 'pass';
    case 'CHALLENGE':
      return 'challenge';
    case 'ACCEPT':
      return 'accept';
    case 'CHOOSE_COLOR':
      return 'choose_color';
    case 'CHOOSE_SWAP_TARGET':
      return 'swap';
    case 'CALL_UNO':
    case 'CATCH_UNO':
      return 'pass';
  }
}

function summarizePlan(state: GameState, playerId: string, plan: readonly GameAction[]): PlanSummary {
  const player = state.players.find(candidate => candidate.id === playerId);
  const first = plan[0];
  const playActions = plan.filter(
    (action): action is Extract<GameAction, { type: 'PLAY_CARD' }> => action.type === 'PLAY_CARD',
  );
  const play = playActions[0];
  const colorAction = plan.find(
    (action): action is Extract<GameAction, { type: 'CHOOSE_COLOR' }> => action.type === 'CHOOSE_COLOR',
  );
  const swapAction = plan.find(
    (action): action is Extract<GameAction, { type: 'CHOOSE_SWAP_TARGET' }> => action.type === 'CHOOSE_SWAP_TARGET',
  );
  const drawAction = plan.find(
    (action): action is Extract<GameAction, { type: 'DRAW_CARD' }> => action.type === 'DRAW_CARD',
  );

  return {
    kind: first ? actionKind(first) : 'pass',
    card: play && player ? player.hand.find(card => card.id === play.cardId) : undefined,
    chosenColor: play?.chosenColor ?? colorAction?.color,
    target: swapAction ? state.players.find(candidate => candidate.id === swapAction.targetId) : undefined,
    cardsPlayed: playActions.length,
    drawSide: drawAction?.side,
    isJumpIn: playActions.some(action => action.isJumpIn === true),
  };
}

function turnDistance(state: GameState, fromIndex: number, targetId: string | undefined): number {
  if (!targetId || fromIndex < 0) return state.players.length;
  let index = fromIndex;
  for (let distance = 0; distance < state.players.length; distance++) {
    if (state.players[index]?.id === targetId) return distance;
    index = getNextAliveIndex(state.players, index, state.direction);
  }
  return state.players.length;
}

function hasSameTrait(card: Card | undefined, topCard: Card | undefined): boolean {
  if (!card || !topCard) return false;
  if (card.type !== topCard.type) return false;
  if (card.type !== 'number' || topCard.type !== 'number') return true;
  return card.value === topCard.value;
}

const TOTAL_COLOR_COUNTS: Readonly<Record<Color, number>> = {
  red: 25,
  blue: 25,
  green: 25,
  yellow: 25,
};
const TOTAL_TYPE_COUNTS: Readonly<Record<CardType, number>> = {
  number: 76,
  skip: 8,
  reverse: 8,
  draw_two: 8,
  wild: 4,
  wild_draw_four: 4,
};

function totalNumberCount(value: number): number {
  return value === 0 ? 4 : 8;
}

function cardValue(card: Card | undefined): number | undefined {
  return card?.type === 'number' ? card.value : undefined;
}

/**
 * Safe production prior using only public information and the actor's hand.
 * The ONNX value head remains responsible for long-horizon value.
 */
export function heuristicRlPlanScore(state: GameState, playerId: string, plan: readonly GameAction[]): number {
  const player = state.players.find(candidate => candidate.id === playerId);
  if (!player || plan.length === 0) return -1;
  const summary = summarizePlan(state, playerId, plan);
  const topCard = state.discardPile[state.discardPile.length - 1];
  const nextIndex = getNextAliveIndex(
    state.players,
    state.players.findIndex(candidate => candidate.id === playerId),
    state.direction,
  );
  const nextPlayer = state.players[nextIndex];
  const nonWildPlayable =
    topCard && state.currentColor
      ? player.hand.some(
          card =>
            card.type !== 'wild' && card.type !== 'wild_draw_four' && canPlayCard(card, topCard, state.currentColor!),
        )
      : false;

  let score = 0;
  switch (summary.kind) {
    case 'play': {
      score += 0.2 + summary.cardsPlayed * 0.28;
      const cardValue: Record<CardType, number> = {
        number: 0.02,
        reverse: 0.12,
        skip: 0.2,
        draw_two: 0.3,
        wild: 0.08,
        wild_draw_four: 0.34,
      };
      if (summary.card) score += cardValue[summary.card.type];
      if (summary.card && (summary.card.type === 'wild' || summary.card.type === 'wild_draw_four') && nonWildPlayable)
        score -= 0.28;
      if (summary.chosenColor) {
        score +=
          ratio(player.hand.filter(card => card.color === summary.chosenColor).length, player.hand.length) * 0.55;
      }
      if (
        nextPlayer &&
        nextPlayer.hand.length <= 2 &&
        (summary.card?.type === 'skip' || summary.card?.type === 'draw_two' || summary.card?.type === 'wild_draw_four')
      )
        score += 0.45;
      if (player.hand.length - summary.cardsPlayed <= 0) score += 2;
      break;
    }
    case 'draw':
      score -= 0.12;
      break;
    case 'pass':
      score -= 0.45;
      break;
    case 'challenge':
      score += 0.02;
      break;
    case 'accept':
      score -= ratio(Math.max(4, state.drawStack), 20) * 0.25;
      break;
    case 'choose_color': {
      if (summary.chosenColor) {
        score += ratio(player.hand.filter(card => card.color === summary.chosenColor).length, player.hand.length);
      }
      break;
    }
    case 'swap': {
      if (summary.target) {
        score += clamp((player.hand.length - summary.target.hand.length) / 10);
      }
      break;
    }
  }
  return clamp(score / 2, -1, 1);
}

function semanticPlanKey(plan: readonly GameAction[]): string {
  const first = plan[0];
  if (!first) return 'empty';
  if (first.type === 'PLAY_CARD') {
    const colorAction = plan.find(
      (action): action is Extract<GameAction, { type: 'CHOOSE_COLOR' }> => action.type === 'CHOOSE_COLOR',
    );
    return `play:${first.cardId}:${first.chosenColor ?? colorAction?.color ?? ''}:${first.isJumpIn === true}`;
  }
  if (first.type === 'DRAW_CARD') return `draw:${first.side}`;
  if (first.type === 'CHOOSE_COLOR') return `color:${first.color}`;
  if (first.type === 'CHOOSE_SWAP_TARGET') return `swap:${first.targetId}`;
  return first.type;
}

/** Collapse equivalent inline/sequential wild-card plans to one action. */
export function canonicalizeRlPlans(plans: readonly GameAction[][]): GameAction[][] {
  const unique = new Map<string, GameAction[]>();
  for (const plan of plans) {
    const key = semanticPlanKey(plan);
    const previous = unique.get(key);
    if (!previous || plan.length < previous.length) unique.set(key, plan);
  }
  return [...unique.values()];
}

export function rlPlanKey(plan: readonly GameAction[]): string {
  return semanticPlanKey(plan);
}

/**
 * Encode an imperfect-information observation and one concrete legal plan.
 * Opponent card identities and draw-pile order are intentionally excluded.
 */
export function encodeRlActionPlan(
  state: GameState,
  playerId: string,
  plan: readonly GameAction[],
  teacherPreferred = false,
): number[] {
  const playerIndex = state.players.findIndex(candidate => candidate.id === playerId);
  const player = state.players[playerIndex];
  if (!player) return Array.from({ length: RL_FEATURE_COUNT }, () => 0);

  const alivePlayers = state.players.filter(candidate => !candidate.eliminated);
  const opponents = alivePlayers.filter(candidate => candidate.id !== playerId);
  const opponentCounts = opponents.map(candidate => candidate.hand.length);
  const totalHands = alivePlayers.reduce((sum, candidate) => sum + candidate.hand.length, 0);
  const minimumOpponent = opponentCounts.length > 0 ? Math.min(...opponentCounts) : 0;
  const maximumOpponent = opponentCounts.length > 0 ? Math.max(...opponentCounts) : 0;
  const meanOpponent =
    opponentCounts.length > 0 ? opponentCounts.reduce((sum, count) => sum + count, 0) / opponentCounts.length : 0;
  const nextIndex = getNextAliveIndex(state.players, playerIndex, state.direction);
  const nextPlayer = state.players[nextIndex];
  const leader = opponents.find(candidate => candidate.hand.length === minimumOpponent);
  const topCard = state.discardPile[state.discardPile.length - 1];
  const summary = summarizePlan(state, playerId, plan);
  const handDenominator = Math.max(1, player.hand.length);
  const playable =
    topCard && state.currentColor ? player.hand.filter(card => canPlayCard(card, topCard, state.currentColor!)) : [];
  const sameTopValue =
    topCard?.type === 'number'
      ? player.hand.filter(card => card.type === 'number' && card.value === topCard.value).length
      : 0;
  const chosenColorCount = summary.chosenColor
    ? player.hand.filter(card => card.color === summary.chosenColor).length
    : 0;
  const handAfterPlay = Math.max(0, player.hand.length - summary.cardsPlayed);
  const hr = state.settings.houseRules;

  const features: number[] = [
    ratio(alivePlayers.length, 10),
    ratio(state.players.length, 10),
    ratio(player.hand.length, 30),
    ratio(player.hand.length, totalHands),
    ratio(minimumOpponent, 30),
    ratio(maximumOpponent, 30),
    ratio(meanOpponent, 30),
    ratio(nextPlayer!.hand.length, 30),
    clamp((player.hand.length - minimumOpponent) / 20),
    ratio(turnDistance(state, playerIndex, leader?.id), 10),
    ratio(state.deckLeft.length, 108),
    ratio(state.deckRight.length, 108),
    ratio(state.discardPile.length, 108),
    ratio(state.drawStack, 20),
    ratio(state.pendingPenaltyDraws, 20),
    state.direction === 'clockwise' ? 1 : 0,
    ratio(player.score, state.settings.targetScore),
    ratio(state.roundNumber, 20),
  ];

  features.push(
    state.phase === 'playing' ? 1 : 0,
    state.phase === 'challenging' ? 1 : 0,
    state.phase === 'choosing_color' ? 1 : 0,
    state.phase === 'choosing_swap_target' ? 1 : 0,
  );
  for (const color of COLORS) features.push(state.currentColor === color ? 1 : 0);
  for (const type of CARD_TYPES) features.push(topCard?.type === type ? 1 : 0);
  for (const color of COLORS) {
    features.push(ratio(player.hand.filter(card => card.color === color).length, handDenominator));
  }
  for (const type of CARD_TYPES) {
    features.push(ratio(player.hand.filter(card => card.type === type).length, handDenominator));
  }
  features.push(ratio(playable.length, handDenominator), ratio(sameTopValue, handDenominator));
  for (const kind of ACTION_KINDS) features.push(summary.kind === kind ? 1 : 0);
  for (const type of CARD_TYPES) features.push(summary.card?.type === type ? 1 : 0);
  for (const color of COLORS) features.push(summary.card?.color === color ? 1 : 0);
  for (const color of COLORS) features.push(summary.chosenColor === color ? 1 : 0);
  features.push(
    ratio(summary.cardsPlayed, 10),
    ratio(handAfterPlay, 30),
    summary.kind === 'play' && handAfterPlay === 0 ? 1 : 0,
    summary.card?.color === state.currentColor ? 1 : 0,
    hasSameTrait(summary.card, topCard) ? 1 : 0,
    ratio(chosenColorCount, handDenominator),
    ratio(summary.target?.hand.length ?? 0, 30),
    summary.target?.id === nextPlayer?.id ? 1 : 0,
    summary.drawSide === 'left' ? 1 : 0,
    summary.drawSide === 'right' ? 1 : 0,
    summary.isJumpIn ? 1 : 0,
    ratio(plan.length, 5),
    hr.stackDrawTwo || hr.stackDrawFour ? 1 : 0,
    hr.crossStack ? 1 : 0,
    hr.reverseDeflectDrawTwo || hr.reverseDeflectDrawFour || hr.skipDeflect ? 1 : 0,
    hr.zeroRotateHands ? 1 : 0,
    hr.sevenSwapHands ? 1 : 0,
    hr.jumpIn ? 1 : 0,
    hr.multiplePlaySameNumber ? 1 : 0,
    hr.drawUntilPlayable ? 1 : 0,
    hr.forcedPlayAfterDraw ? 1 : 0,
    hr.handLimit !== null ? 1 : 0,
    hr.teamMode ? 1 : 0,
    hr.noFunctionCardFinish || hr.noWildFinish ? 1 : 0,
    heuristicRlPlanScore(state, playerId, plan),
  );
  features.push(
    hr.stackDrawTwo ? 1 : 0,
    hr.stackDrawFour ? 1 : 0,
    hr.crossStack ? 1 : 0,
    hr.reverseDeflectDrawTwo ? 1 : 0,
    hr.reverseDeflectDrawFour ? 1 : 0,
    hr.skipDeflect ? 1 : 0,
    hr.zeroRotateHands ? 1 : 0,
    hr.sevenSwapHands ? 1 : 0,
    hr.jumpIn ? 1 : 0,
    hr.multiplePlaySameNumber ? 1 : 0,
    hr.wildFirstTurn ? 1 : 0,
    hr.drawUntilPlayable ? 1 : 0,
    hr.forcedPlayAfterDraw ? 1 : 0,
    ratio(hr.handLimit ?? 0, 30),
    hr.forcedPlay ? 1 : 0,
    ratio(hr.handRevealThreshold ?? 0, 30),
    ratio(hr.unoPenaltyCount, 6),
    hr.strictUnoCall ? 1 : 0,
    hr.misplayPenalty ? 1 : 0,
    hr.fastMode ? 1 : 0,
    hr.noHints ? 1 : 0,
    hr.elimination ? 1 : 0,
    ratio(hr.blitzTimeLimit ?? 0, 120),
    hr.revengeMode ? 1 : 0,
    hr.silentUno ? 1 : 0,
    hr.teamMode ? 1 : 0,
    hr.noFunctionCardFinish ? 1 : 0,
    hr.noWildFinish ? 1 : 0,
    hr.doubleScore ? 1 : 0,
    hr.noChallengeWildFour ? 1 : 0,
    hr.blindDraw ? 1 : 0,
    hr.bombCard ? 1 : 0,
    hr.shuffleSeats ? 1 : 0,
  );

  // Public card counting. The unseen pool is opponent hands plus both decks;
  // it is derived only from the standard deck composition, the actor's own
  // hand, and the public discard pile, never from hidden card identities.
  const ownAndDiscard = [...player.hand, ...state.discardPile];
  const actionValue = cardValue(summary.card);
  const topValue = cardValue(topCard);
  for (const value of NUMBERS) features.push(topValue === value ? 1 : 0);
  for (const value of NUMBERS) features.push(actionValue === value ? 1 : 0);
  for (const value of NUMBERS) {
    features.push(
      ratio(player.hand.filter(card => card.type === 'number' && card.value === value).length, handDenominator),
    );
  }
  for (const value of NUMBERS) {
    features.push(
      ratio(
        state.discardPile.filter(card => card.type === 'number' && card.value === value).length,
        totalNumberCount(value),
      ),
    );
  }
  for (const color of COLORS) {
    features.push(ratio(state.discardPile.filter(card => card.color === color).length, TOTAL_COLOR_COUNTS[color]));
  }
  for (const type of CARD_TYPES) {
    features.push(ratio(state.discardPile.filter(card => card.type === type).length, TOTAL_TYPE_COUNTS[type]));
  }
  for (const color of COLORS) {
    const visible = ownAndDiscard.filter(card => card.color === color).length;
    features.push(ratio(Math.max(0, TOTAL_COLOR_COUNTS[color] - visible), TOTAL_COLOR_COUNTS[color]));
  }
  for (const type of CARD_TYPES) {
    const visible = ownAndDiscard.filter(card => card.type === type).length;
    features.push(ratio(Math.max(0, TOTAL_TYPE_COUNTS[type] - visible), TOTAL_TYPE_COUNTS[type]));
  }
  for (const type of LAST_ACTION_TYPES) features.push(state.lastAction?.type === type ? 1 : 0);

  // Ordered public memory: current top card first, followed by the fifteen
  // preceding discards. This captures tactical sequences without
  // storing or exposing any opponent hand or draw-pile information.
  for (let offset = 0; offset < RL_RECENT_DISCARD_SLOTS; offset++) {
    const card = state.discardPile[state.discardPile.length - 1 - offset];
    const chosenColor = card && (card.type === 'wild' || card.type === 'wild_draw_four') ? card.chosenColor : undefined;
    for (const color of COLORS) features.push(card?.color === color ? 1 : 0);
    for (const type of CARD_TYPES) features.push(card?.type === type ? 1 : 0);
    const value = cardValue(card);
    for (const number of NUMBERS) features.push(value === number ? 1 : 0);
    for (const color of COLORS) features.push(chosenColor === color ? 1 : 0);
  }
  features.push(teacherPreferred ? 1 : 0);

  if (features.length !== RL_FEATURE_COUNT) {
    throw new Error(`RL feature schema mismatch: expected ${RL_FEATURE_COUNT}, got ${features.length}`);
  }
  return features;
}

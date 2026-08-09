import type { GameState, GameAction, DrawSide } from '../types/game.js';
import type { Color } from '../types/card.js';
import { reshuffleSideFromDiscard } from './deck.js';
import { canPlayCard, isValidWildDrawFour, canRespondToDrawStack as canRespondToDrawStackPure } from './validation.js';
import { getNextAliveIndex, countAlivePlayers, reverseDirection } from './turn.js';
import { calculateRoundScores } from './scoring.js';
import { UNO_PENALTY_CARDS } from '../constants/scoring.js';

export const PENALTY_STATE_DEFAULTS = {
  pendingPenaltyDraws: 0,
  pendingPenaltyNextPlayerIndex: null,
  pendingPenaltySourcePlayerId: null,
  pendingPenaltyQueue: [] as {
    playerId: string;
    count: number;
    nextPlayerIndex: number;
    sourcePlayerId: string | null;
  }[],
  pendingRevengeDraws: 0,
  pendingDrawPlayerId: null,
  drawStack: 0,
} as const;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

export function hasCardsAvailable(state: GameState): boolean {
  return state.deckLeft.length > 0 || state.deckRight.length > 0 || state.discardPile.length > 1;
}

/**
 * The handLimit house rule rejects DRAW_CARD at/above the limit. When the
 * current player additionally has nothing playable, PASS is the only way the
 * turn can advance — handlePass and the drawUntilPlayable plugin both wave
 * PASS through in exactly that situation to avoid a deadlock.
 */
export function isStuckAtHandLimit(state: GameState): boolean {
  const limit = state.settings.houseRules.handLimit;
  if (limit === null) return false;
  const player = state.players[state.currentPlayerIndex];
  if (!player || player.hand.length < limit) return false;
  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!topCard || !state.currentColor) return true;
  return !player.hand.some(card => canPlayCard(card, topCard, state.currentColor!));
}

/**
 * A PASS would make no progress when every active player lacks a playable
 * card and nobody can draw. End such a round as a draw instead of rotating
 * the exact same state forever.
 *
 * Drawing can be unavailable either because every physical draw source is
 * exhausted or because the hand-limit rule blocks every active player.
 */
function isPassStalemate(state: GameState): boolean {
  if (state.phase !== 'playing') return false;
  if (state.pendingPenaltyDraws > 0 || state.drawStack > 0) return false;
  // A successful draw followed by PASS still advances the turn and therefore
  // makes progress, even when that draw happened to exhaust the final source.
  if (
    state.lastAction?.type === 'DRAW_CARD' &&
    state.lastAction.playerId === state.players[state.currentPlayerIndex]?.id
  ) {
    return false;
  }

  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!topCard || !state.currentColor) return false;

  const activePlayers = state.players.filter(player => !player.eliminated);
  if (activePlayers.length < 2) return false;
  if (
    activePlayers.some(player =>
      player.hand.some(
        card => canPlayCard(card, topCard, state.currentColor!) && !isFinishRestrictedLastCard(state, player, card),
      ),
    )
  ) {
    return false;
  }

  if (!hasCardsAvailable(state)) return true;

  const limit = state.settings.houseRules.handLimit;
  return limit !== null && activePlayers.every(player => player.hand.length >= limit);
}

function isFinishRestrictedLastCard(
  state: GameState,
  player: GameState['players'][number],
  card: GameState['players'][number]['hand'][number],
): boolean {
  if (player.hand.length !== 1) return false;
  const hr = state.settings.houseRules;
  return (
    (hr.noWildFinish && (card.type === 'wild' || card.type === 'wild_draw_four')) ||
    (hr.noFunctionCardFinish && (card.type === 'draw_two' || card.type === 'wild_draw_four'))
  );
}

function currentPlayerHasPlayableCard(state: GameState): boolean {
  const player = state.players[state.currentPlayerIndex];
  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!player || !topCard || !state.currentColor) return false;

  return player.hand.some(
    card => canPlayCard(card, topCard, state.currentColor!) && !isFinishRestrictedLastCard(state, player, card),
  );
}

/**
 * Draw `count` cards from the specified side deck into the given player's hand.
 * Reshuffles from the discard pile into the side deck if it runs out mid-draw.
 */
export function drawCards(state: GameState, playerId: string, count: number, side: DrawSide): GameState {
  let sideDeck = side === 'left' ? [...state.deckLeft] : [...state.deckRight];
  let discardPile = [...state.discardPile];
  const initialCount = side === 'left' ? state.deckLeftInitialCount : state.deckRightInitialCount;
  const players = state.players.map(p => ({ ...p, hand: [...p.hand] }));
  const playerIdx = players.findIndex(p => p.id === playerId);
  if (playerIdx === -1) {
    throw new Error(`Cannot draw cards for unknown player: ${playerId}`);
  }

  for (let i = 0; i < count; i++) {
    if (sideDeck.length === 0) {
      const reshuffled = reshuffleSideFromDiscard(sideDeck, discardPile, initialCount);
      sideDeck = reshuffled.sideDeck;
      discardPile = reshuffled.discardPile;
    }
    if (sideDeck.length === 0) break;
    const card = sideDeck.shift()!;
    players[playerIdx]!.hand.push(card);
    players[playerIdx]!.calledUno = false;
    players[playerIdx]!.unoCaught = false;
  }

  return {
    ...state,
    deckLeft: side === 'left' ? sideDeck : state.deckLeft,
    deckRight: side === 'right' ? sideDeck : state.deckRight,
    discardPile,
    players,
  };
}

/**
 * Check if a player has emptied their hand. If so, end the round.
 */
export function checkRoundEnd(state: GameState, playerId: string): GameState {
  const player = state.players.find(p => p.id === playerId);
  if (!player) {
    throw new Error(`Cannot check round end for unknown player: ${playerId}`);
  }
  if (player.hand.length > 0) return state;

  const scores = calculateRoundScores(state.players, playerId);
  // Add round scores to cumulative player scores
  const players = state.players.map(p => {
    const roundScore = scores[p.id];
    if (roundScore === undefined) {
      throw new Error(`Missing round score for player: ${p.id}`);
    }
    return {
      ...p,
      score: p.score + roundScore,
      roundWins: p.id === playerId ? p.roundWins + 1 : p.roundWins,
    };
  });

  // Check if winner has reached/exceeded the target score
  const winner = players.find(p => p.id === playerId)!;
  const phase = winner.score >= state.settings.targetScore ? 'game_over' : 'round_end';

  return {
    ...state,
    players,
    phase,
    winnerId: playerId,
    ...PENALTY_STATE_DEFAULTS,
  };
}

/**
 * Get the index of the player in the players array by id.
 */
function playerIndex(state: GameState, playerId: string): number {
  return state.players.findIndex(p => p.id === playerId);
}

/**
 * Get the current player's id.
 */
function currentPlayerId(state: GameState): string {
  const player = state.players[state.currentPlayerIndex];
  if (!player) {
    throw new Error(`Current player index is out of range: ${state.currentPlayerIndex}`);
  }
  return player.id;
}

function canRespondToDrawStack(state: GameState, cardId: string): boolean {
  if (state.drawStack <= 0) return false;

  const player = state.players[state.currentPlayerIndex];
  const card = player?.hand.find(c => c.id === cardId);
  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!card || !topCard) return false;

  return canRespondToDrawStackPure(card, topCard, state.settings.houseRules);
}

function hasPlayableCardForUnoCall(state: GameState, player: GameState['players'][number]): boolean {
  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!topCard || !state.currentColor) return false;

  if (state.drawStack > 0) {
    return player.hand.some(card => canRespondToDrawStack(state, card.id));
  }

  return player.hand.some(card => canPlayCard(card, topCard, state.currentColor!));
}

export function startPenaltyDraw(
  state: GameState,
  playerId: string,
  count: number,
  nextPlayerIndex: number,
  sourcePlayerId: string | null = null,
): GameState {
  if (count <= 0) return state;
  const playerIdx = playerIndex(state, playerId);
  if (playerIdx === -1) {
    throw new Error(`Cannot start a penalty for unknown player: ${playerId}`);
  }

  const shouldQueue = state.pendingPenaltyDraws > 0 || state.phase !== 'playing';

  if (shouldQueue) {
    return {
      ...state,
      pendingPenaltyQueue: [...state.pendingPenaltyQueue, { playerId, count, nextPlayerIndex, sourcePlayerId }],
    };
  }

  return {
    ...state,
    phase: 'playing',
    currentPlayerIndex: playerIdx,
    pendingPenaltyDraws: count,
    pendingPenaltyNextPlayerIndex: nextPlayerIndex,
    pendingPenaltySourcePlayerId: sourcePlayerId,
    pendingPenaltyQueue: state.pendingPenaltyQueue,
  };
}

function finishPenaltyDrawIfNeeded(
  state: GameState,
  lastAction: Extract<GameAction, { type: 'DRAW_CARD' }>,
): GameState {
  const remaining = state.pendingPenaltyDraws;
  if (remaining <= 0) return state;

  // One draw action settles the unavailable remainder when every source is
  // exhausted. Requiring one no-op click per missing penalty card makes large
  // stacks consume thousands of fake turns without changing any cards.
  const nextRemaining = hasCardsAvailable(state) ? Math.max(remaining - 1, 0) : 0;
  if (nextRemaining > 0) {
    return { ...state, pendingPenaltyDraws: nextRemaining, lastAction };
  }

  const queued = state.pendingPenaltyQueue;
  const [nextPenalty, ...restQueue] = queued;
  if (nextPenalty) {
    return startPenaltyDraw(
      {
        ...state,
        pendingPenaltyDraws: 0,
        pendingPenaltyNextPlayerIndex: null,
        pendingPenaltySourcePlayerId: null,
        pendingPenaltyQueue: restQueue,
        lastAction,
      },
      nextPenalty.playerId,
      nextPenalty.count,
      nextPenalty.nextPlayerIndex,
      nextPenalty.sourcePlayerId,
    );
  }

  if (state.pendingPenaltyNextPlayerIndex === null) {
    throw new Error('Active penalty is missing its next player index');
  }

  let finished: GameState = {
    ...state,
    pendingPenaltyDraws: 0,
    pendingPenaltyNextPlayerIndex: null,
    pendingPenaltySourcePlayerId: null,
    pendingPenaltyQueue: [],
    currentPlayerIndex: state.pendingPenaltyNextPlayerIndex,
    lastAction,
  };

  if (state.pendingPenaltySourcePlayerId) {
    finished = checkRoundEnd(finished, state.pendingPenaltySourcePlayerId);
  }

  return finished;
}

export function drainPenaltyQueue(state: GameState): GameState {
  const queue = state.pendingPenaltyQueue;
  // A queued penalty must wait for the active penalty to be paid. Otherwise a
  // house-rule pre-check that deliberately returns the unchanged state (for
  // example drawUntilPlayable rejecting PASS) can pop and immediately requeue
  // the next penalty, producing a new-but-equivalent state forever.
  if (queue.length === 0 || state.phase !== 'playing' || state.pendingPenaltyDraws > 0) {
    return state;
  }
  const [next, ...rest] = queue;
  return startPenaltyDraw(
    { ...state, pendingPenaltyQueue: rest },
    next!.playerId,
    next!.count,
    next!.nextPlayerIndex,
    next!.sourcePlayerId,
  );
}

function withChosenColorOnTopDiscard(state: GameState, color: Color): GameState {
  const discardPile = [...state.discardPile];
  const topCard = discardPile[discardPile.length - 1];

  if (topCard?.type !== 'wild' && topCard?.type !== 'wild_draw_four') {
    throw new Error('Color selection is missing a wild card on top of the discard pile');
  }
  discardPile[discardPile.length - 1] = { ...topCard, chosenColor: color };

  return { ...state, discardPile };
}

function getWildDrawFourChallengeColor(state: GameState): Color {
  const discardLen = state.discardPile.length;
  const topCard = state.discardPile[discardLen - 1];
  if (topCard?.type !== 'wild_draw_four' || topCard.chosenColor === undefined) {
    throw new Error('Wild Draw Four challenge is missing its played card and chosen color');
  }
  if (discardLen < 2) {
    throw new Error('Wild Draw Four challenge is missing the previous discard');
  }

  const prevCard = state.discardPile[discardLen - 2]!;
  if (prevCard.type === 'wild' || prevCard.type === 'wild_draw_four') {
    if (prevCard.chosenColor === undefined) {
      throw new Error('Wild Draw Four challenge is missing the previous wild color');
    }
    return prevCard.chosenColor;
  }
  return prevCard.color;
}

// -----------------------------------------------------------------------------
// Action handlers
// -----------------------------------------------------------------------------

function handlePlayCard(state: GameState, action: Extract<GameAction, { type: 'PLAY_CARD' }>): GameState {
  // Must be in playing phase
  if (state.phase !== 'playing') return state;

  // Penalty draws from +2/+4 must be fully paid before the player can act.
  if (state.pendingPenaltyDraws > 0) return state;

  // Must be the current player
  if (action.playerId !== currentPlayerId(state)) return state;

  const actingPlayerIdx = state.currentPlayerIndex;
  const actingPlayer = state.players[actingPlayerIdx]!;

  // Find the card in hand
  const cardIdx = actingPlayer.hand.findIndex(c => c.id === action.cardId);
  if (cardIdx === -1) return state;

  const card = actingPlayer.hand[cardIdx]!;
  const topCard = state.discardPile[state.discardPile.length - 1]!;

  // Validate the play
  if (!canPlayCard(card, topCard, state.currentColor!)) return state;

  // Remove card from hand
  const newHand = [...actingPlayer.hand.slice(0, cardIdx), ...actingPlayer.hand.slice(cardIdx + 1)];

  // Update discard pile
  const newDiscardPile = [...state.discardPile, card];

  const players = state.players.map((p, idx) =>
    idx === actingPlayerIdx
      ? { ...p, hand: newHand, calledUno: newHand.length === 1 ? p.calledUno : false, unoCaught: false }
      : { ...p },
  );

  let newState: GameState = {
    ...state,
    players,
    discardPile: newDiscardPile,
    lastAction: action,
  };

  // Apply card-specific effects
  switch (card.type) {
    case 'number': {
      const newColor = card.color;
      newState = {
        ...newState,
        currentColor: newColor,
        currentPlayerIndex: getNextAliveIndex(state.players, actingPlayerIdx, state.direction),
      };
      break;
    }

    case 'skip': {
      newState = {
        ...newState,
        currentColor: card.color,
        // Skip next player: advance past 2 alive players (skip=1 means 1+1=2)
        currentPlayerIndex: getNextAliveIndex(state.players, actingPlayerIdx, state.direction, 1),
      };
      break;
    }

    case 'reverse': {
      const newDirection = reverseDirection(state.direction);
      if (countAlivePlayers(state.players) === 2) {
        // In 2-player, reverse acts as skip: current player keeps the turn
        newState = {
          ...newState,
          currentColor: card.color,
          direction: newDirection,
          currentPlayerIndex: actingPlayerIdx,
        };
      } else {
        // Normal reverse: flip direction and advance to next player in new direction
        newState = {
          ...newState,
          currentColor: card.color,
          direction: newDirection,
          currentPlayerIndex: getNextAliveIndex(state.players, actingPlayerIdx, newDirection),
        };
      }
      break;
    }

    case 'draw_two': {
      const nextIdx = getNextAliveIndex(state.players, actingPlayerIdx, state.direction);
      const nextPlayerId = state.players[nextIdx]!.id;
      newState = startPenaltyDraw(
        { ...newState, currentColor: card.color },
        nextPlayerId,
        2,
        getNextAliveIndex(state.players, actingPlayerIdx, state.direction, 1),
        actingPlayer.id,
      );
      break;
    }

    case 'wild': {
      // Transition to choosing_color; current player stays
      newState = {
        ...newState,
        phase: 'choosing_color',
        // currentPlayerIndex stays (p1 needs to choose)
      };
      break;
    }

    case 'wild_draw_four': {
      const nextIdx = getNextAliveIndex(state.players, actingPlayerIdx, state.direction);
      const nextPlayerId = state.players[nextIdx]!.id;
      newState = {
        ...newState,
        phase: 'choosing_color',
        pendingDrawPlayerId: nextPlayerId,
      };
      break;
    }
  }

  newState = checkRoundEnd(newState, actingPlayer.id);

  return newState;
}

function handleDrawCard(state: GameState, action: Extract<GameAction, { type: 'DRAW_CARD' }>): GameState {
  if (state.phase !== 'playing') return state;
  if (action.playerId !== currentPlayerId(state)) return state;
  if (!hasCardsAvailable(state) && state.pendingPenaltyDraws === 0) return state;

  const newState = drawCards(state, action.playerId, 1, action.side);
  if (state.pendingPenaltyDraws > 0) {
    return finishPenaltyDrawIfNeeded(newState, action);
  }
  return { ...newState, lastAction: action };
}

function handlePass(state: GameState, action: Extract<GameAction, { type: 'PASS' }>): GameState {
  if (state.phase !== 'playing') return state;
  if (action.playerId !== currentPlayerId(state)) return state;

  const noCards = !hasCardsAvailable(state);
  const completedDraw = state.lastAction?.type === 'DRAW_CARD' && state.lastAction.playerId === action.playerId;

  if (!noCards) {
    if (state.pendingPenaltyDraws > 0 || state.drawStack > 0) return state;

    // Can only pass after drawing — unless the hand limit blocks drawing and
    // nothing is playable, in which case PASS is the only legal move left.
    if (
      !isStuckAtHandLimit(state) &&
      (!state.lastAction || state.lastAction.type !== 'DRAW_CARD' || state.lastAction.playerId !== action.playerId)
    ) {
      return state;
    }
  } else if (
    state.pendingPenaltyDraws === 0 &&
    state.drawStack === 0 &&
    !completedDraw &&
    currentPlayerHasPlayableCard(state)
  ) {
    return state;
  }

  if (isPassStalemate(state)) {
    return {
      ...state,
      phase: 'round_end',
      winnerId: null,
      lastAction: action,
      ...PENALTY_STATE_DEFAULTS,
    };
  }

  const newIndex = getNextAliveIndex(state.players, state.currentPlayerIndex, state.direction);
  return {
    ...state,
    currentPlayerIndex: newIndex,
    lastAction: action,
    ...(noCards ? PENALTY_STATE_DEFAULTS : {}),
  };
}

function handleChooseColor(state: GameState, action: Extract<GameAction, { type: 'CHOOSE_COLOR' }>): GameState {
  if (state.phase !== 'choosing_color') return state;
  if (action.playerId !== currentPlayerId(state)) return state;

  const colorState = withChosenColorOnTopDiscard(state, action.color);

  if (colorState.pendingDrawPlayerId !== null) {
    const topCard = colorState.discardPile[colorState.discardPile.length - 1];
    if (topCard?.type !== 'wild_draw_four') {
      throw new Error('Wild Draw Four challenge target exists without a Wild Draw Four');
    }
    // wild_draw_four: move to challenging phase
    return {
      ...colorState,
      currentColor: action.color,
      phase: 'challenging',
      lastAction: action,
    };
  } else {
    const newIndex = getNextAliveIndex(colorState.players, colorState.currentPlayerIndex, colorState.direction);
    return drainPenaltyQueue({
      ...colorState,
      currentColor: action.color,
      phase: 'playing',
      currentPlayerIndex: newIndex,
      lastAction: action,
    });
  }
}

function handleChallenge(state: GameState, action: Extract<GameAction, { type: 'CHALLENGE' }>): GameState {
  if (state.phase !== 'challenging') return state;
  if (action.playerId !== state.pendingDrawPlayerId) return state;

  const wd4PlayerIdx = state.currentPlayerIndex;
  const wd4Player = state.players[wd4PlayerIdx];
  if (!wd4Player) {
    throw new Error(`Wild Draw Four challenge has an invalid player index: ${wd4PlayerIdx}`);
  }
  const challengerIdx = playerIndex(state, action.playerId);
  if (challengerIdx === -1) {
    throw new Error(`Wild Draw Four challenge target is not a player: ${action.playerId}`);
  }
  const prevColor = getWildDrawFourChallengeColor(state);
  const wd4WasLegal = isValidWildDrawFour(wd4Player.hand, prevColor);
  const revengeBonus = state.pendingRevengeDraws;
  const settledState = { ...state, pendingRevengeDraws: 0 };

  if (wd4WasLegal) {
    const nextIdx = getNextAliveIndex(state.players, challengerIdx, state.direction);
    return startPenaltyDraw(
      {
        ...settledState,
        phase: 'playing',
        pendingDrawPlayerId: null,
        lastAction: {
          ...action,
          succeeded: false,
          penaltyPlayerId: action.playerId,
          penaltyCount: 6 + revengeBonus,
        },
      },
      action.playerId,
      6 + revengeBonus,
      nextIdx,
      wd4Player.id,
    );
  }

  const nextIdx = getNextAliveIndex(state.players, wd4PlayerIdx, state.direction);
  return startPenaltyDraw(
    {
      ...settledState,
      phase: 'playing',
      pendingDrawPlayerId: null,
      lastAction: {
        ...action,
        succeeded: true,
        penaltyPlayerId: wd4Player.id,
        penaltyCount: 4 + revengeBonus,
      },
    },
    wd4Player.id,
    4 + revengeBonus,
    nextIdx,
  );
}
function handleAccept(state: GameState, action: Extract<GameAction, { type: 'ACCEPT' }>): GameState {
  if (state.phase !== 'challenging') return state;
  if (action.playerId !== state.pendingDrawPlayerId) return state;

  const wd4PlayerId = currentPlayerId(state);
  const accepterIdx = playerIndex(state, action.playerId);
  if (accepterIdx === -1) {
    throw new Error(`Wild Draw Four penalty target is not a player: ${action.playerId}`);
  }
  const nextIdx = getNextAliveIndex(state.players, accepterIdx, state.direction);
  const revengeBonus = state.pendingRevengeDraws;
  return startPenaltyDraw(
    {
      ...state,
      pendingRevengeDraws: 0,
      phase: 'playing',
      pendingDrawPlayerId: null,
      lastAction: {
        ...action,
        penaltyPlayerId: action.playerId,
        penaltyCount: 4 + revengeBonus,
      },
    },
    action.playerId,
    4 + revengeBonus,
    nextIdx,
    wd4PlayerId,
  );
}
function handleCallUno(state: GameState, action: Extract<GameAction, { type: 'CALL_UNO' }>): GameState {
  const idx = playerIndex(state, action.playerId);
  if (idx === -1) return state;

  const player = state.players[idx]!;
  const isPayingUnoPenalty =
    state.pendingPenaltyDraws > 0 && state.currentPlayerIndex === idx && state.pendingPenaltySourcePlayerId === null;
  if (player.unoCaught || isPayingUnoPenalty) return state;

  const strictUnoCall = state.settings.houseRules.strictUnoCall;
  const canCallUno =
    player.hand.length === 1 ||
    (!strictUnoCall &&
      player.hand.length === 2 &&
      currentPlayerId(state) === action.playerId &&
      hasPlayableCardForUnoCall(state, player));
  if (!canCallUno) return state;

  const players = state.players.map((p, i) => (i === idx ? { ...p, calledUno: true, unoCaught: false } : p));
  return { ...state, players, lastAction: action };
}

function handleCatchUno(state: GameState, action: Extract<GameAction, { type: 'CATCH_UNO' }>): GameState {
  const targetIdx = playerIndex(state, action.targetId);
  if (targetIdx === -1) return state;

  const target = state.players[targetIdx]!;
  // Can only catch a player with exactly 1 card who hasn't called UNO
  if (target.hand.length !== 1 || target.calledUno || target.unoCaught) return state;

  const players = state.players.map((p, i) => (i === targetIdx ? { ...p, unoCaught: true } : p));
  return startPenaltyDraw(
    { ...state, players, lastAction: action },
    action.targetId,
    UNO_PENALTY_CARDS,
    state.currentPlayerIndex,
  );
}

// -----------------------------------------------------------------------------
// Main reducer
// -----------------------------------------------------------------------------

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'PLAY_CARD':
      return handlePlayCard(state, action);
    case 'DRAW_CARD':
      return handleDrawCard(state, action);
    case 'PASS':
      return handlePass(state, action);
    case 'CHOOSE_COLOR':
      return handleChooseColor(state, action);
    case 'CHALLENGE':
      return handleChallenge(state, action);
    case 'ACCEPT':
      return handleAccept(state, action);
    case 'CALL_UNO':
      return handleCallUno(state, action);
    case 'CATCH_UNO':
      return handleCatchUno(state, action);
    default:
      return state;
  }
}

import type { GameState, GameAction, PendingPenaltyDraw } from '../types/game';
import type { Color } from '../types/card';
import { reshuffleDiscardIntoDeck } from './deck';
import { canPlayCard, isValidWildDrawFour } from './validation';
import { getNextPlayerIndex, reverseDirection } from './turn';
import { calculateRoundScores } from './scoring';
import { UNO_PENALTY_CARDS } from '../constants/scoring';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Draw `count` cards from the deck into the given player's hand.
 * Reshuffles the discard pile into the deck if the deck runs out mid-draw.
 */
function drawCards(state: GameState, playerId: string, count: number): GameState {
  let deck = [...state.deck];
  let discardPile = [...state.discardPile];
  const players = state.players.map(p => ({ ...p, hand: [...p.hand] }));
  const playerIdx = players.findIndex(p => p.id === playerId);
  if (playerIdx === -1) return state;

  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      const reshuffled = reshuffleDiscardIntoDeck(deck, discardPile);
      deck = reshuffled.deck;
      discardPile = reshuffled.discardPile;
    }
    if (deck.length === 0) break; // nothing left even after reshuffle
    const card = deck.shift()!;
    players[playerIdx]!.hand.push(card);
    players[playerIdx]!.calledUno = false;
    players[playerIdx]!.unoCaught = false;
  }

  return { ...state, deck, discardPile, players };
}

/**
 * Check if a player has emptied their hand. If so, end the round.
 */
export function checkRoundEnd(state: GameState, playerId: string): GameState {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.hand.length > 0) return state;

  const scores = calculateRoundScores(state.players, playerId);
  // Add round scores to cumulative player scores
  const players = state.players.map(p => ({
    ...p,
    score: p.score + (scores[p.id] ?? 0),
    roundWins: p.id === playerId ? (p.roundWins ?? 0) + 1 : (p.roundWins ?? 0),
  }));

  // Check if winner has reached/exceeded the target score
  const winner = players.find(p => p.id === playerId)!;
  const phase = winner.score >= state.settings.targetScore ? 'game_over' : 'round_end';

  return {
    ...state,
    players,
    phase,
    winnerId: playerId,
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
  return state.players[state.currentPlayerIndex]!.id;
}

function startPenaltyDraw(
  state: GameState,
  playerId: string,
  count: number,
  nextPlayerIndex: number,
  sourcePlayerId: string | null = null,
): GameState {
  if (count <= 0) return state;
  const playerIdx = playerIndex(state, playerId);
  if (playerIdx === -1) return state;
  const queue: PendingPenaltyDraw[] = state.pendingPenaltyDraws && state.pendingPenaltyDraws > 0
    ? [
        ...(state.pendingPenaltyQueue ?? []),
        { playerId, count, nextPlayerIndex, sourcePlayerId },
      ]
    : (state.pendingPenaltyQueue ?? []);

  if (state.pendingPenaltyDraws && state.pendingPenaltyDraws > 0) {
    return { ...state, pendingPenaltyQueue: queue };
  }

  return {
    ...state,
    phase: 'playing',
    currentPlayerIndex: playerIdx,
    pendingPenaltyDraws: count,
    pendingPenaltyNextPlayerIndex: nextPlayerIndex,
    pendingPenaltySourcePlayerId: sourcePlayerId,
    pendingPenaltyQueue: queue,
  };
}

function finishPenaltyDrawIfNeeded(state: GameState, lastAction: GameAction): GameState {
  const remaining = state.pendingPenaltyDraws ?? 0;
  if (remaining <= 0) return state;

  const nextRemaining = Math.max(remaining - 1, 0);
  if (nextRemaining > 0) {
    return { ...state, pendingPenaltyDraws: nextRemaining, lastAction };
  }

  const queued = state.pendingPenaltyQueue ?? [];
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
      nextPenalty.sourcePlayerId ?? null,
    );
  }

  let finished: GameState = {
    ...state,
    pendingPenaltyDraws: 0,
    pendingPenaltyNextPlayerIndex: null,
    pendingPenaltySourcePlayerId: null,
    pendingPenaltyQueue: [],
    currentPlayerIndex: state.pendingPenaltyNextPlayerIndex ?? state.currentPlayerIndex,
    lastAction,
  };

  if (state.pendingPenaltySourcePlayerId) {
    finished = checkRoundEnd(finished, state.pendingPenaltySourcePlayerId);
  }

  return finished;
}

function withChosenColorOnTopDiscard(state: GameState, color: Color): GameState {
  const discardPile = [...state.discardPile];
  const topCard = discardPile[discardPile.length - 1];

  if (topCard?.type === 'wild' || topCard?.type === 'wild_draw_four') {
    discardPile[discardPile.length - 1] = { ...topCard, chosenColor: color };
  }

  return { ...state, discardPile };
}

function getWildDrawFourChallengeColor(state: GameState): Color {
  const discardLen = state.discardPile.length;
  if (discardLen >= 2) {
    const prevCard = state.discardPile[discardLen - 2]!;
    if (prevCard.type === 'wild' || prevCard.type === 'wild_draw_four') {
      return prevCard.chosenColor ?? state.currentColor ?? 'red';
    }
    return prevCard.color;
  }

  return state.currentColor ?? 'red';
}

// -----------------------------------------------------------------------------
// Action handlers
// -----------------------------------------------------------------------------

function handlePlayCard(
  state: GameState,
  action: Extract<GameAction, { type: 'PLAY_CARD' }>,
): GameState {
  // Must be in playing phase
  if (state.phase !== 'playing') return state;

  // Must be the current player
  if (action.playerId !== currentPlayerId(state)) return state;

  if ((state.pendingPenaltyDraws ?? 0) > 0) return state;

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
  const newHand = [
    ...actingPlayer.hand.slice(0, cardIdx),
    ...actingPlayer.hand.slice(cardIdx + 1),
  ];

  // Update discard pile
  const newDiscardPile = [...state.discardPile, card];

  const players = state.players.map((p, idx) =>
    idx === actingPlayerIdx
      ? { ...p, hand: newHand, calledUno: newHand.length === 1 ? p.calledUno : false, unoCaught: false }
      : { ...p }
  );

  let newState: GameState = {
    ...state,
    players,
    discardPile: newDiscardPile,
    lastAction: action,
  };

  const playerCount = state.players.length;

  // Apply card-specific effects
  switch (card.type) {
    case 'number': {
      const newColor = card.color;
      newState = {
        ...newState,
        currentColor: newColor,
        currentPlayerIndex: getNextPlayerIndex(actingPlayerIdx, playerCount, state.direction),
      };
      break;
    }

    case 'skip': {
      newState = {
        ...newState,
        currentColor: card.color,
        // Skip next player: advance by 2 (skip=1 means advance by 1+1=2)
        currentPlayerIndex: getNextPlayerIndex(actingPlayerIdx, playerCount, state.direction, 1),
      };
      break;
    }

    case 'reverse': {
      const newDirection = reverseDirection(state.direction);
      if (playerCount === 2) {
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
          currentPlayerIndex: getNextPlayerIndex(actingPlayerIdx, playerCount, newDirection),
        };
      }
      break;
    }

    case 'draw_two': {
      const nextIdx = getNextPlayerIndex(actingPlayerIdx, playerCount, state.direction);
      const nextPlayerId = state.players[nextIdx]!.id;
      newState = startPenaltyDraw(
        { ...newState, currentColor: card.color },
        nextPlayerId,
        2,
        getNextPlayerIndex(actingPlayerIdx, playerCount, state.direction, 1),
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
      const nextIdx = getNextPlayerIndex(actingPlayerIdx, playerCount, state.direction);
      const nextPlayerId = state.players[nextIdx]!.id;
      newState = {
        ...newState,
        phase: 'choosing_color',
        pendingDrawPlayerId: nextPlayerId,
      };
      break;
    }
  }

  if (card.type !== 'wild' && card.type !== 'wild_draw_four' && card.type !== 'draw_two') {
    newState = checkRoundEnd(newState, actingPlayer.id);
  }

  return newState;
}

function handleDrawCard(
  state: GameState,
  action: Extract<GameAction, { type: 'DRAW_CARD' }>,
): GameState {
  if (state.phase !== 'playing') return state;
  if (action.playerId !== currentPlayerId(state)) return state;

  const newState = drawCards(state, action.playerId, 1);
  if ((state.pendingPenaltyDraws ?? 0) > 0) {
    return finishPenaltyDrawIfNeeded(newState, action);
  }
  return { ...newState, lastAction: action };
}

function handlePass(
  state: GameState,
  action: Extract<GameAction, { type: 'PASS' }>,
): GameState {
  if (state.phase !== 'playing') return state;
  if (action.playerId !== currentPlayerId(state)) return state;
  if ((state.pendingPenaltyDraws ?? 0) > 0) return state;

  // Can only pass after drawing
  if (
    !state.lastAction ||
    state.lastAction.type !== 'DRAW_CARD' ||
    state.lastAction.playerId !== action.playerId
  ) {
    return state;
  }

  const newIndex = getNextPlayerIndex(
    state.currentPlayerIndex,
    state.players.length,
    state.direction,
  );
  return { ...state, currentPlayerIndex: newIndex, lastAction: action };
}

function handleChooseColor(
  state: GameState,
  action: Extract<GameAction, { type: 'CHOOSE_COLOR' }>,
): GameState {
  if (state.phase !== 'choosing_color') return state;
  if (action.playerId !== currentPlayerId(state)) return state;

  const colorState = withChosenColorOnTopDiscard(state, action.color);

  if (colorState.pendingDrawPlayerId !== null) {
    // wild_draw_four: move to challenging phase
    return {
      ...colorState,
      currentColor: action.color,
      phase: 'challenging',
      lastAction: action,
    };
  } else {
    const actingPlayerId = currentPlayerId(colorState);
    if (colorState.lastAction?.type === 'PLAY_CARD') {
      const endedState = checkRoundEnd(
        { ...colorState, currentColor: action.color, lastAction: action },
        actingPlayerId,
      );
      if (endedState.phase === 'round_end' || endedState.phase === 'game_over') {
        return endedState;
      }
    }

    // plain wild: advance to next player and return to playing
    const newIndex = getNextPlayerIndex(
      colorState.currentPlayerIndex,
      colorState.players.length,
      colorState.direction,
    );
    return {
      ...colorState,
      currentColor: action.color,
      phase: 'playing',
      currentPlayerIndex: newIndex,
      lastAction: action,
    };
  }
}

function handleChallenge(
  state: GameState,
  action: Extract<GameAction, { type: 'CHALLENGE' }>,
): GameState {
  if (state.phase !== 'challenging') return state;
  if (action.playerId !== state.pendingDrawPlayerId) return state;

  const wd4PlayerIdx = state.currentPlayerIndex;
  const wd4Player = state.players[wd4PlayerIdx]!;
  const challengerIdx = playerIndex(state, action.playerId);
  const prevColor = getWildDrawFourChallengeColor(state);
  const wd4WasLegal = isValidWildDrawFour(wd4Player.hand, prevColor);

  if (wd4WasLegal) {
    const nextIdx = getNextPlayerIndex(challengerIdx, state.players.length, state.direction);
    return startPenaltyDraw({
      ...state,
      phase: 'playing',
      pendingDrawPlayerId: null,
      lastAction: { ...action, succeeded: false, penaltyPlayerId: action.playerId, penaltyCount: 6 },
    }, action.playerId, 6, nextIdx, state.lastAction?.type === 'CHOOSE_COLOR' ? wd4Player.id : null);
  }

  const nextIdx = getNextPlayerIndex(wd4PlayerIdx, state.players.length, state.direction);
  return startPenaltyDraw({
    ...state,
    phase: 'playing',
    pendingDrawPlayerId: null,
    lastAction: { ...action, succeeded: true, penaltyPlayerId: wd4Player.id, penaltyCount: 4 },
  }, wd4Player.id, 4, nextIdx);
}
function handleAccept(
  state: GameState,
  action: Extract<GameAction, { type: 'ACCEPT' }>,
): GameState {
  if (state.phase !== 'challenging') return state;
  if (action.playerId !== state.pendingDrawPlayerId) return state;

  const wd4PlayerId = currentPlayerId(state);
  const accepterIdx = playerIndex(state, action.playerId);
  const nextIdx = getNextPlayerIndex(accepterIdx, state.players.length, state.direction);
  return startPenaltyDraw({
    ...state,
    phase: 'playing',
    pendingDrawPlayerId: null,
    lastAction: action,
  }, action.playerId, 4, nextIdx, state.lastAction?.type === 'CHOOSE_COLOR' ? wd4PlayerId : null);
}
function handleCallUno(
  state: GameState,
  action: Extract<GameAction, { type: 'CALL_UNO' }>,
): GameState {
  const idx = playerIndex(state, action.playerId);
  if (idx === -1) return state;

  const player = state.players[idx]!;
  const strictUnoCall = state.settings.houseRules?.strictUnoCall ?? false;
  const canCallUno = player.hand.length === 1
    || (!strictUnoCall && player.hand.length === 2 && currentPlayerId(state) === action.playerId);
  if (!canCallUno) return state;

  const players = state.players.map((p, i) =>
    i === idx ? { ...p, calledUno: true, unoCaught: false } : p
  );
  return { ...state, players, lastAction: action };
}

function handleCatchUno(
  state: GameState,
  action: Extract<GameAction, { type: 'CATCH_UNO' }>,
): GameState {
  const targetIdx = playerIndex(state, action.targetId);
  if (targetIdx === -1) return state;

  const target = state.players[targetIdx]!;
  // Can only catch a player with exactly 1 card who hasn't called UNO
  if (target.hand.length !== 1 || target.calledUno || target.unoCaught) return state;

  const players = state.players.map((p, i) =>
    i === targetIdx ? { ...p, unoCaught: true } : p,
  );
  return startPenaltyDraw({ ...state, players, lastAction: action }, action.targetId, UNO_PENALTY_CARDS, state.currentPlayerIndex);
}

// -----------------------------------------------------------------------------
// Main reducer
// -----------------------------------------------------------------------------

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'PLAY_CARD':    return handlePlayCard(state, action);
    case 'DRAW_CARD':    return handleDrawCard(state, action);
    case 'PASS':         return handlePass(state, action);
    case 'CHOOSE_COLOR': return handleChooseColor(state, action);
    case 'CHALLENGE':    return handleChallenge(state, action);
    case 'ACCEPT':       return handleAccept(state, action);
    case 'CALL_UNO':     return handleCallUno(state, action);
    case 'CATCH_UNO':    return handleCatchUno(state, action);
    default:             return state;
  }
}

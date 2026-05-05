import type { GameState, GameAction } from '../types/game.js';
import type { Card } from '../types/card.js';
import { isWildCard } from '../types/card.js';
import { applyAction } from './game-engine.js';
import { canPlayCard } from './validation.js';
import { reshuffleDiscardIntoDeck } from './deck.js';
import { getNextPlayerIndex } from './turn.js';

// ──────────────────────────────────────────────────────────────────────────────
// Internal helper: draw `count` cards into a player's hand
// ──────────────────────────────────────────────────────────────────────────────

function drawCardsFromDeck(state: GameState, playerId: string, count: number): GameState {
  const playerIndex = state.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return state;
  let deck = [...state.deck];
  let discardPile = [...state.discardPile];
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      const r = reshuffleDiscardIntoDeck(deck, discardPile);
      deck = r.deck;
      discardPile = r.discardPile;
    }
    if (deck.length === 0) break;
    drawn.push(deck.shift()!);
  }
  const players = state.players.map((p, idx) =>
    idx === playerIndex ? { ...p, hand: [...p.hand, ...drawn], calledUno: false } : p,
  );
  return { ...state, players, deck, discardPile };
}

// ──────────────────────────────────────────────────────────────────────────────
// Pre-check helpers
// ──────────────────────────────────────────────────────────────────────────────

/** True when the card being played is the player's last card. */
function isLastCard(state: GameState, playerId: string, cardId: string): boolean {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return false;
  return player.hand.length === 1 && player.hand[0]!.id === cardId;
}

/** True when the card type is "wild" or "wild_draw_four". */
function isWildType(card: Card): boolean {
  return isWildCard(card);
}

/** True when the card type is a function/action card that causes adverse effects
 *  (draw_two and wild_draw_four). */
function isFunctionCard(card: Card): boolean {
  return card.type === 'draw_two' || card.type === 'wild_draw_four';
}

// ──────────────────────────────────────────────────────────────────────────────
// Post-process: doubleScore
// ──────────────────────────────────────────────────────────────────────────────

/**
 * If the round just ended and doubleScore is enabled, double the winner's
 * freshly-earned points.
 */
function applyDoubleScore(before: GameState, after: GameState): GameState {
  if (!after.settings.houseRules.doubleScore) return after;
  // Round ended if phase changed to round_end or game_over AND we have a winner
  if (
    (after.phase === 'round_end' || after.phase === 'game_over') &&
    before.phase === 'playing' &&
    after.winnerId !== null
  ) {
    const winnerId = after.winnerId;
    // The winner's score delta is the points earned this round
    const beforeScore = before.players.find(p => p.id === winnerId)?.score ?? 0;
    const afterScore = after.players.find(p => p.id === winnerId)?.score ?? 0;
    const earned = afterScore - beforeScore;
    if (earned > 0) {
      const players = after.players.map(p =>
        p.id === winnerId ? { ...p, score: beforeScore + earned * 2 } : p,
      );
      // Re-check phase: if doubled score now exceeds target, keep game_over
      return { ...after, players };
    }
  }
  return after;
}

// ──────────────────────────────────────────────────────────────────────────────
// drawUntilPlayable: override DRAW_CARD to keep drawing until a playable card
// ──────────────────────────────────────────────────────────────────────────────

function handleDrawUntilPlayable(state: GameState, action: Extract<GameAction, { type: 'DRAW_CARD' }>): GameState {
  if (state.phase !== 'playing') return applyAction(state, action);

  const topCard = state.discardPile[state.discardPile.length - 1]!;
  const currentColor = state.currentColor!;
  let current = state;

  // Draw cards one by one until a playable card lands
  while (true) {
    // Draw one card
    let deck = [...current.deck];
    let discardPile = [...current.discardPile];
    if (deck.length === 0) {
      const r = reshuffleDiscardIntoDeck(deck, discardPile);
      deck = r.deck;
      discardPile = r.discardPile;
    }
    if (deck.length === 0) break; // No cards left anywhere

    const drawnCard = deck.shift()!;
    const players = current.players.map((p, idx) =>
      idx === current.currentPlayerIndex
        ? { ...p, hand: [...p.hand, drawnCard], calledUno: false }
        : p,
    );
    current = { ...current, players, deck, discardPile, lastAction: action };

    // If this card is playable, stop drawing
    if (canPlayCard(drawnCard, topCard, currentColor)) {
      break;
    }
  }

  return current;
}

// ──────────────────────────────────────────────────────────────────────────────
// forcedPlayAfterDraw: after DRAW_CARD, auto-play drawn card if playable
// ──────────────────────────────────────────────────────────────────────────────

function handleForcedPlayAfterDraw(stateAfterDraw: GameState, originalAction: Extract<GameAction, { type: 'DRAW_CARD' }>): GameState {
  // Find the card that was drawn (last card added to current player's hand)
  const player = stateAfterDraw.players[stateAfterDraw.currentPlayerIndex]!;
  if (player.hand.length === 0) return stateAfterDraw;

  const drawnCard = player.hand[player.hand.length - 1]!;
  const topCard = stateAfterDraw.discardPile[stateAfterDraw.discardPile.length - 1]!;
  const currentColor = stateAfterDraw.currentColor!;

  if (!canPlayCard(drawnCard, topCard, currentColor)) {
    // Not playable — leave state as-is (player must pass)
    return stateAfterDraw;
  }

  // Auto-play the drawn card
  const playAction: GameAction = { type: 'PLAY_CARD', playerId: originalAction.playerId, cardId: drawnCard.id };
  return applyAction(stateAfterDraw, playAction);
}

// ──────────────────────────────────────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────────────────────────────────────

export function applyActionWithHouseRules(state: GameState, action: GameAction): GameState {
  const hr = state.settings.houseRules;

  // ── Pre-checks ──────────────────────────────────────────────────────────────

  if (action.type === 'PLAY_CARD') {
    const player = state.players.find(p => p.id === action.playerId);
    const card = player?.hand.find(c => c.id === action.cardId);
    if (card) {
      // noWildFinish: reject wild/wild_draw_four as last card
      if (hr.noWildFinish && isLastCard(state, action.playerId, action.cardId) && isWildType(card)) {
        return state;
      }

      // noFunctionCardFinish: reject draw_two/wild_draw_four as last card
      if (hr.noFunctionCardFinish && isLastCard(state, action.playerId, action.cardId) && isFunctionCard(card)) {
        return state;
      }
    }
  }

  // silentUno: CATCH_UNO does nothing
  if (action.type === 'CATCH_UNO' && hr.silentUno) {
    return state;
  }

  // noChallengeWildFour: CHALLENGE does nothing
  if (action.type === 'CHALLENGE' && hr.noChallengeWildFour) {
    return state;
  }

  // unoPenaltyCount: custom penalty for CATCH_UNO (bypass standard handler)
  if (action.type === 'CATCH_UNO' && hr.unoPenaltyCount !== 2) {
    const targetIdx = state.players.findIndex(p => p.id === action.targetId);
    if (targetIdx === -1) return state;
    const target = state.players[targetIdx]!;
    // Same validation as standard engine: 1 card, not called UNO
    if (target.hand.length !== 1 || target.calledUno) return state;
    return drawCardsFromDeck(state, action.targetId, hr.unoPenaltyCount);
  }

  // ── handLimit: reject DRAW_CARD when hand is at or above limit ────────────
  if (action.type === 'DRAW_CARD' && hr.handLimit !== null) {
    const player = state.players[state.currentPlayerIndex];
    if (player && player.id === action.playerId && player.hand.length >= hr.handLimit) return state;
  }

  // ── forcedPlay: reject DRAW_CARD if player has a playable card ────────────
  if (action.type === 'DRAW_CARD' && hr.forcedPlay && state.phase === 'playing') {
    const player = state.players[state.currentPlayerIndex];
    if (player?.id === action.playerId) {
      const topCard = state.discardPile[state.discardPile.length - 1];
      if (topCard && state.currentColor) {
        const playable = player.hand.filter(c => canPlayCard(c, topCard, state.currentColor!));
        if (playable.length > 0) return state;
      }
    }
  }

  // ── deathDraw: block PASS if player has no playable card (force more drawing) ─
  if (action.type === 'PASS' && hr.deathDraw && state.phase === 'playing') {
    const player = state.players[state.currentPlayerIndex];
    if (player?.id === action.playerId) {
      const topCard = state.discardPile[state.discardPile.length - 1];
      if (topCard && state.currentColor) {
        const playable = player.hand.filter(c => canPlayCard(c, topCard, state.currentColor!));
        if (playable.length === 0) return state;
      }
    }
  }

  // ── multiplePlaySameNumber: allow PASS after PLAY_CARD of number card ──────
  if (action.type === 'PASS' && (hr.multiplePlaySameNumber || hr.bombCard) && state.phase === 'playing') {
    const player = state.players[state.currentPlayerIndex];
    if (player?.id === action.playerId && state.lastAction?.type === 'PLAY_CARD') {
      const topCard = state.discardPile[state.discardPile.length - 1];
      if (topCard?.type === 'number') {
        const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.direction);
        let result: GameState = { ...state, currentPlayerIndex: nextIdx, lastAction: action };
        // bombCard: check how many consecutive same-number cards are at top of discard
        if (hr.bombCard) {
          const topValue = topCard.value;
          let bombCount = 0;
          for (let i = state.discardPile.length - 1; i >= 0; i--) {
            const c = state.discardPile[i]!;
            if (c.type === 'number' && c.value === topValue) bombCount++;
            else break;
          }
          if (bombCount >= 3) {
            for (const p of result.players) {
              if (p.id !== player.id) {
                result = drawCardsFromDeck(result, p.id, 1);
              }
            }
          }
        }
        return result;
      }
    }
  }

  // ── misplayPenalty or blindDraw: invalid PLAY_CARD draws 1 penalty card ───────────────
  if (action.type === 'PLAY_CARD' && (hr.misplayPenalty || hr.blindDraw)) {
    const standardResult = applyAction(state, action);
    if (standardResult === state) {
      return drawCardsFromDeck(state, action.playerId, 1);
    }
  }

  // ── Deflection: Reverse or Skip deflect draw penalties ──────────────────────
  if (action.type === 'PLAY_CARD' && state.drawStack > 0) {
    const player = state.players[state.currentPlayerIndex];
    if (player && player.id === action.playerId) {
      const card = player.hand.find(c => c.id === action.cardId);
      const topCard = state.discardPile[state.discardPile.length - 1];
      if (card) {
        // Reverse deflect: reverse direction, penalty stays and goes back
        const canReverseDeflect =
          (hr.reverseDeflectDrawTwo && card.type === 'reverse' && topCard?.type === 'draw_two') ||
          (hr.reverseDeflectDrawFour && card.type === 'reverse' && topCard?.type === 'wild_draw_four');

        if (canReverseDeflect) {
          const newHand = player.hand.filter(c => c.id !== action.cardId);
          const newDirection = state.direction === 'clockwise' ? 'counter_clockwise' : 'clockwise';
          const players = state.players.map((p, i) =>
            i === state.currentPlayerIndex ? { ...p, hand: newHand } : p,
          );
          const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, players.length, newDirection);
          return {
            ...state,
            players,
            discardPile: [...state.discardPile, card],
            currentColor: card.color ?? state.currentColor,
            direction: newDirection,
            currentPlayerIndex: nextIdx,
            lastAction: action,
          };
        }

        // Skip deflect: skip self, pass penalty to next player
        if (hr.skipDeflect && card.type === 'skip') {
          const newHand = player.hand.filter(c => c.id !== action.cardId);
          const players = state.players.map((p, i) =>
            i === state.currentPlayerIndex ? { ...p, hand: newHand } : p,
          );
          const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction);
          return {
            ...state,
            players,
            discardPile: [...state.discardPile, card],
            currentColor: card.color ?? state.currentColor,
            currentPlayerIndex: nextIdx,
            lastAction: action,
          };
        }
      }
    }
  }

  // ── Stacking (+2/+4/cross-stack): intercept PLAY_CARD when drawStack > 0 ──
  if (action.type === 'PLAY_CARD' && state.drawStack > 0) {
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== action.playerId) return state;
    const card = player.hand.find(c => c.id === action.cardId);
    if (!card) return state;
    const topCard = state.discardPile[state.discardPile.length - 1];
    const canStack =
      (hr.stackDrawTwo && card.type === 'draw_two' && topCard?.type === 'draw_two') ||
      (hr.stackDrawFour && card.type === 'wild_draw_four' && topCard?.type === 'wild_draw_four') ||
      (hr.crossStack && ((card.type === 'draw_two' && topCard?.type === 'wild_draw_four') || (card.type === 'wild_draw_four' && topCard?.type === 'draw_two')));
    if (canStack) {
      const newHand = player.hand.filter(c => c.id !== action.cardId);
      const stackAdd = card.type === 'draw_two' ? 2 : 4;
      const players = state.players.map((p, i) =>
        i === state.currentPlayerIndex ? { ...p, hand: newHand } : p,
      );
      const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction);
      const newColor = card.type === 'draw_two' ? card.color : (action.chosenColor ?? state.currentColor);
      return {
        ...state,
        players,
        discardPile: [...state.discardPile, card],
        currentColor: newColor,
        drawStack: state.drawStack + stackAdd,
        currentPlayerIndex: nextIdx,
        lastAction: action,
      };
    }
  }

  // ── Stacking: intercept DRAW_CARD when drawStack > 0 ─────────────────────
  if (action.type === 'DRAW_CARD' && state.drawStack > 0 && (hr.stackDrawTwo || hr.stackDrawFour || hr.crossStack)) {
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.id !== action.playerId) return state;
    let newState = drawCardsFromDeck(state, action.playerId, state.drawStack);
    const nextIdx = getNextPlayerIndex(newState.currentPlayerIndex, newState.players.length, newState.direction);
    return { ...newState, drawStack: 0, currentPlayerIndex: nextIdx, lastAction: action };
  }

  // ── drawUntilPlayable: override DRAW_CARD behaviour ──────────────────────
  if (action.type === 'DRAW_CARD' && hr.drawUntilPlayable) {
    return handleDrawUntilPlayable(state, action);
  }

  // ── deathDraw: draw until playable (same as drawUntilPlayable) ──────────
  if (action.type === 'DRAW_CARD' && hr.deathDraw && !hr.drawUntilPlayable) {
    return handleDrawUntilPlayable(state, action);
  }

  // ── jumpIn: allow out-of-turn play if card exactly matches discard top ──────
  if (action.type === 'PLAY_CARD' && hr.jumpIn && state.phase === 'playing') {
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer && currentPlayer.id !== action.playerId) {
      // Out-of-turn play attempt — check if card exactly matches top
      const jumperIdx = state.players.findIndex(p => p.id === action.playerId);
      if (jumperIdx === -1) return state;
      const jumper = state.players[jumperIdx]!;
      const card = jumper.hand.find(c => c.id === action.cardId);
      if (!card) return state;
      const topCard = state.discardPile[state.discardPile.length - 1];
      if (!topCard) return state;
      // Exact match: same type, same color, same value (for numbers)
      const exactMatch =
        card.type === topCard.type &&
        card.color === topCard.color &&
        (card.type !== 'number' || (topCard.type === 'number' && card.value === topCard.value));
      if (exactMatch) {
        const newHand = jumper.hand.filter(c => c.id !== action.cardId);
        const players = state.players.map((p, i) =>
          i === jumperIdx ? { ...p, hand: newHand } : p,
        );
        const nextIdx = getNextPlayerIndex(jumperIdx, players.length, state.direction);
        return {
          ...state,
          players,
          discardPile: [...state.discardPile, card],
          currentColor: card.color ?? state.currentColor,
          currentPlayerIndex: nextIdx,
          lastAction: action,
        };
      }
      return state; // Not an exact match, reject
    }
  }

  // ── Standard action processing ───────────────────────────────────────────
  let next = applyAction(state, action);

  // ── Post-processing ─────────────────────────────────────────────────────

  // zeroRotateHands: after playing a 0, rotate all hands in current direction
  if (action.type === 'PLAY_CARD' && hr.zeroRotateHands && next !== state) {
    const playedCard = state.players[state.currentPlayerIndex]?.hand.find(c => c.id === action.cardId);
    if (playedCard?.type === 'number' && playedCard.value === 0) {
      const hands = next.players.map(p => [...p.hand]);
      const rotated = next.players.map((p, i) => {
        const sourceIdx = next.direction === 'clockwise'
          ? (i - 1 + next.players.length) % next.players.length
          : (i + 1) % next.players.length;
        return { ...p, hand: hands[sourceIdx]! };
      });
      next = { ...next, players: rotated };
    }
  }

  // sevenSwapHands: after playing a 7, enter choosing_swap_target phase
  if (action.type === 'PLAY_CARD' && hr.sevenSwapHands && next !== state) {
    const playedCard = state.players[state.currentPlayerIndex]?.hand.find(c => c.id === action.cardId);
    if (playedCard?.type === 'number' && playedCard.value === 7) {
      next = { ...next, phase: 'choosing_swap_target' as any, currentPlayerIndex: state.currentPlayerIndex };
    }
  }

  // CHOOSE_SWAP_TARGET: execute the swap
  if (action.type === 'CHOOSE_SWAP_TARGET' && hr.sevenSwapHands) {
    if (state.phase !== 'choosing_swap_target') return state;
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== action.playerId) return state;
    const targetIdx = state.players.findIndex(p => p.id === action.targetId);
    if (targetIdx === -1 || targetIdx === state.currentPlayerIndex) return state;
    const currentHand = [...state.players[state.currentPlayerIndex]!.hand];
    const targetHand = [...state.players[targetIdx]!.hand];
    const players = state.players.map((p, i) => {
      if (i === state.currentPlayerIndex) return { ...p, hand: targetHand };
      if (i === targetIdx) return { ...p, hand: currentHand };
      return p;
    });
    const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, players.length, state.direction);
    return { ...state, players, phase: 'playing', currentPlayerIndex: nextIdx, lastAction: action };
  }

  // revengeMode: if the previous discard was an attack card and the current player
  // counter-attacks with another attack card, double the card's draw penalty
  if (action.type === 'PLAY_CARD' && hr.revengeMode && next !== state) {
    const playedCard = state.players[state.currentPlayerIndex]?.hand.find(c => c.id === action.cardId);
    if (playedCard && (playedCard.type === 'draw_two' || playedCard.type === 'wild_draw_four')) {
      const prevTopCard = state.discardPile[state.discardPile.length - 1];
      if (prevTopCard && (prevTopCard.type === 'draw_two' || prevTopCard.type === 'wild_draw_four')) {
        if (playedCard.type === 'draw_two') {
          // Base engine already drew 2 for the victim; draw 2 more to double it
          const victimIdx = getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.direction);
          const victimId = state.players[victimIdx]!.id;
          next = drawCardsFromDeck(next, victimId, 2);
        } else {
          // wild_draw_four: base engine sets pendingDrawPlayerId; double by setting drawStack
          // The pending draw of 4 will happen later; add 4 to drawStack as extra penalty
          next = { ...next, drawStack: next.drawStack + 4 };
        }
      }
    }
  }

  // multiplePlaySameNumber: after playing a number card, keep turn if player has more same-number cards
  if (action.type === 'PLAY_CARD' && (hr.multiplePlaySameNumber || hr.bombCard) && next !== state) {
    const playedCard = state.players[state.currentPlayerIndex]?.hand.find(c => c.id === action.cardId);
    if (playedCard?.type === 'number') {
      const playerAfter = next.players[state.currentPlayerIndex];
      if (playerAfter && playerAfter.hand.some(c => c.type === 'number' && c.value === playedCard.value)) {
        next = { ...next, currentPlayerIndex: state.currentPlayerIndex };
      }
    }
  }

  // forcedPlayAfterDraw: after a normal DRAW_CARD, auto-play if card is playable
  if (action.type === 'DRAW_CARD' && hr.forcedPlayAfterDraw) {
    next = handleForcedPlayAfterDraw(next, action);
  }

  // doubleScore: double the winner's round points when round ends
  next = applyDoubleScore(state, next);

  // teamMode: distribute score to team on round end
  if (hr.teamMode && (next.phase === 'round_end' || next.phase === 'game_over') && state.phase === 'playing' && next.winnerId) {
    const winner = next.players.find(p => p.id === next.winnerId);
    if (winner?.teamId !== undefined) {
      const earned = (winner.score) - (state.players.find(p => p.id === winner.id)?.score ?? 0);
      if (earned > 0) {
        const players = next.players.map(p => {
          if (p.teamId === winner.teamId && p.id !== winner.id) {
            return { ...p, score: p.score + earned };
          }
          return p;
        });
        next = { ...next, players };
      }
    }
  }

  // elimination: after round end, eliminate player with most cards
  if (hr.elimination && next.phase === 'round_end' && state.phase !== 'round_end') {
    const nonEliminated = next.players.filter(p => !p.eliminated);
    if (nonEliminated.length > 1) {
      const nonWinners = nonEliminated.filter(p => p.id !== next.winnerId);
      let maxCards = 0;
      let loser: typeof nonWinners[0] | null = null;
      for (const p of nonWinners) {
        if (p.hand.length > maxCards) {
          maxCards = p.hand.length;
          loser = p;
        }
      }
      if (loser) {
        const players = next.players.map(p =>
          p.id === loser!.id ? { ...p, eliminated: true } : p,
        );
        const remaining = players.filter(p => !p.eliminated);
        if (remaining.length <= 1) {
          next = { ...next, players, phase: 'game_over', winnerId: remaining[0]?.id ?? next.winnerId };
        } else {
          next = { ...next, players };
        }
      }
    }
  }

  return next;
}

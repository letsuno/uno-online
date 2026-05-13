import type { GameState, GameAction, DrawSide } from '../types/game.js';
import type { Color, Card } from '../types/card.js';
import { getPlayableCards, isExactJumpInMatch } from './validation.js';

function bestColor(hand: Card[], excludeId?: string): Color {
  const counts: Record<Color, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const c of hand) {
    if (c.color && c.id !== excludeId) counts[c.color]++;
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'red') as Color;
}

function playCardActions(playerId: string, card: Card, hand: Card[], chooseColorOnPlay = false): GameAction[] {
  const color = bestColor(hand, card.id);
  const actions: GameAction[] = [{
    type: 'PLAY_CARD',
    playerId,
    cardId: card.id,
    ...(chooseColorOnPlay ? { chosenColor: color } : {}),
  }];
  if (card.type === 'wild' || card.type === 'wild_draw_four') {
    if (!chooseColorOnPlay) {
      actions.push({ type: 'CHOOSE_COLOR', playerId, color });
    }
  }
  return actions;
}

function pickPlayableCard(playable: Card[], currentColor: Color): Card {
  return (
    playable.find(c => c.color === currentColor) ??
    playable.find(c => c.color !== null) ??
    playable[0]!
  );
}

export function canJumpIn(state: GameState, playerId: string): boolean {
  if (!state.settings.houseRules.jumpIn || state.phase !== 'playing') return false;
  if ((state.pendingPenaltyDraws ?? 0) > 0 || state.drawStack > 0) return false;
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id === playerId) return false;
  const player = state.players.find(p => p.id === playerId);
  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!player || !topCard) return false;
  return player.hand.some(c => isExactJumpInMatch(c, topCard));
}

export function chooseJumpInAction(state: GameState, playerId: string): GameAction[] {
  if (!state.settings.houseRules.jumpIn || state.phase !== 'playing') return [];
  if ((state.pendingPenaltyDraws ?? 0) > 0 || state.drawStack > 0) return [];
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id === playerId) return [];
  const player = state.players.find(p => p.id === playerId);
  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!player || !topCard) return [];
  const card = player.hand.find(c => isExactJumpInMatch(c, topCard));
  if (!card) return [];
  return playCardActions(playerId, card, player.hand);
}

export function chooseAutopilotJumpInAction(state: GameState, playerId: string): GameAction[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player?.autopilot) return [];
  return chooseJumpInAction(state, playerId);
}

export function chooseAutopilotAction(state: GameState, playerId: string): GameAction[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  const autopilotSide: DrawSide = state.deckLeft.length >= state.deckRight.length ? 'left' : 'right';
  const hr = state.settings.houseRules;

  if (state.phase === 'challenging') {
    if (state.pendingDrawPlayerId === playerId) {
      const topCard = state.discardPile[state.discardPile.length - 1];
      if (topCard && (hr.stackDrawFour || hr.crossStack)) {
        const stackable = player.hand.find(c =>
          (hr.stackDrawFour && c.type === 'wild_draw_four') ||
          (hr.crossStack && (c.type === 'draw_two' || c.type === 'wild_draw_four')),
        );
        if (stackable) {
          const chosenColor = stackable.type === 'wild_draw_four' ? bestColor(player.hand) : undefined;
          return [{ type: 'PLAY_CARD', playerId, cardId: stackable.id, ...(chosenColor ? { chosenColor } : {}) }];
        }
      }
      return [{ type: 'ACCEPT', playerId }];
    }
    return [];
  }

  if (state.phase === 'choosing_color') {
    return [{ type: 'CHOOSE_COLOR', playerId, color: bestColor(player.hand) }];
  }

  if (state.phase === 'choosing_swap_target') {
    const targets = state.players.filter(p => p.id !== playerId && !p.eliminated);
    if (targets.length === 0) return [];
    const target = targets.reduce((best, p) => p.hand.length < best.hand.length ? p : best, targets[0]!);
    return [{ type: 'CHOOSE_SWAP_TARGET', playerId, targetId: target.id }];
  }

  if (state.phase !== 'playing') return [];

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return [];

  const noCards = state.deckLeft.length === 0 && state.deckRight.length === 0 && state.discardPile.length <= 1;

  if ((state.pendingPenaltyDraws ?? 0) > 0) {
    if (noCards) return [{ type: 'PASS', playerId }];
    return [{ type: 'DRAW_CARD', playerId, side: autopilotSide }];
  }

  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!topCard || !state.currentColor) {
    if (noCards) return [{ type: 'PASS', playerId }];
    return [{ type: 'DRAW_CARD', playerId, side: autopilotSide }];
  }

  const hasDrawnThisTurn =
    state.lastAction?.type === 'DRAW_CARD' &&
    state.lastAction.playerId === playerId;

  if (hasDrawnThisTurn && state.drawStack === 0) {
    const playableAfterDraw = getPlayableCards(player.hand, topCard, state.currentColor);
    if (playableAfterDraw.length === 0) {
      if (!noCards && (state.settings.houseRules.drawUntilPlayable || state.settings.houseRules.deathDraw)) {
        return [{ type: 'DRAW_CARD', playerId, side: autopilotSide }];
      }
      return [{ type: 'PASS', playerId }];
    }
    const pick = pickPlayableCard(playableAfterDraw, state.currentColor);
    const needsColorOnPlay = pick.type === 'wild_draw_four' && state.drawStack > 0 && (hr.stackDrawFour || hr.crossStack);
    return playCardActions(playerId, pick, player.hand, needsColorOnPlay);
  }

  if (state.drawStack > 0) {
    const stackingEnabled = hr.stackDrawTwo || hr.stackDrawFour || hr.crossStack;

    if (stackingEnabled) {
      const stackable = player.hand.filter(c => {
        if (hr.stackDrawTwo && c.type === 'draw_two' && topCard.type === 'draw_two') return true;
        if (hr.stackDrawFour && c.type === 'wild_draw_four' && topCard.type === 'wild_draw_four') return true;
        if (hr.crossStack && ((c.type === 'draw_two' && topCard.type === 'wild_draw_four') || (c.type === 'wild_draw_four' && topCard.type === 'draw_two'))) return true;
        return false;
      });
      if (stackable.length > 0) {
        const pick = stackable[0]!;
        return playCardActions(playerId, pick, player.hand, pick.type === 'wild_draw_four');
      }
    }

    const deflectionEnabled = hr.reverseDeflectDrawTwo || hr.reverseDeflectDrawFour || hr.skipDeflect;
    if (deflectionEnabled) {
      const deflectable = player.hand.filter(c => {
        if (c.type === 'reverse' && hr.reverseDeflectDrawTwo && topCard.type === 'draw_two') return true;
        if (c.type === 'reverse' && hr.reverseDeflectDrawFour && topCard.type === 'wild_draw_four') return true;
        if (c.type === 'skip' && hr.skipDeflect) return true;
        return false;
      });
      if (deflectable.length > 0) {
        const pick = deflectable[0]!;
        return [{ type: 'PLAY_CARD', playerId, cardId: pick.id }];
      }
    }

    if (noCards) return [{ type: 'PASS', playerId }];
    return [{ type: 'DRAW_CARD', playerId, side: autopilotSide }];
  }

  const playable = getPlayableCards(player.hand, topCard, state.currentColor);
  if (playable.length === 0) {
    if (noCards) return [{ type: 'PASS', playerId }];
    return [{ type: 'DRAW_CARD', playerId, side: autopilotSide }];
  }

  const pick = pickPlayableCard(playable, state.currentColor);
  const needsColorOnPlay = pick.type === 'wild_draw_four' && state.drawStack > 0 && (hr.stackDrawFour || hr.crossStack);
  return playCardActions(playerId, pick, player.hand, needsColorOnPlay);
}

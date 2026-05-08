import type { GameState, GameAction } from '../types/game';
import type { Color, Card } from '../types/card';
import { getPlayableCards } from './validation';

function bestColor(hand: Card[], excludeId?: string): Color {
  const counts: Record<Color, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const c of hand) {
    if (c.color && c.id !== excludeId) counts[c.color]++;
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'red') as Color;
}

export function chooseAutopilotAction(state: GameState, playerId: string): GameAction[] {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return [];

  if (state.phase === 'challenging') {
    if (state.pendingDrawPlayerId === playerId) {
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
    const target = targets.reduce((best, p) => p.hand.length > best.hand.length ? p : best, targets[0]!);
    return [{ type: 'CHOOSE_SWAP_TARGET', playerId, targetId: target.id }];
  }

  if (state.phase !== 'playing') return [];

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return [];

  const topCard = state.discardPile[state.discardPile.length - 1];
  if (!topCard || !state.currentColor) return [{ type: 'DRAW_CARD', playerId }];

  if (state.drawStack > 0) {
    const hr = state.settings.houseRules;
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
        const actions: GameAction[] = [{ type: 'PLAY_CARD', playerId, cardId: pick.id }];
        if (pick.type === 'wild_draw_four') {
          actions.push({ type: 'CHOOSE_COLOR', playerId, color: bestColor(player.hand, pick.id) });
        }
        return actions;
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

    return [{ type: 'DRAW_CARD', playerId }];
  }

  const playable = getPlayableCards(player.hand, topCard, state.currentColor);
  if (playable.length === 0) {
    return [{ type: 'DRAW_CARD', playerId }];
  }

  // Priority: same-color non-wild > any non-wild > wild as last resort
  let pick = playable.find(c => c.color === state.currentColor);
  if (!pick) pick = playable.find(c => c.color !== null);
  if (!pick) pick = playable[0]!;

  const isWild = pick.type === 'wild' || pick.type === 'wild_draw_four';
  const actions: GameAction[] = [{ type: 'PLAY_CARD', playerId, cardId: pick.id }];
  if (isWild) {
    actions.push({ type: 'CHOOSE_COLOR', playerId, color: bestColor(player.hand, pick.id) });
  }
  return actions;
}

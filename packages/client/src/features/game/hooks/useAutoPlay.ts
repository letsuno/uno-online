import { useEffect } from 'react';
import type { Card, Color } from '@uno-online/shared';
import { useGameStore } from '../stores/game-store';
import { useSettingsStore } from '@/shared/stores/settings-store';
import { useEffectiveUserId } from './useEffectiveUserId';
import { useIsMyTurn } from './useIsMyTurn';
import { usePlayableCardIds } from './usePlayableCardIds';
import { getSocket } from '@/shared/socket';

/**
 * Pick the most frequent color in the given hand (excluding excludeCardId).
 * Falls back to 'red' if the hand has no colored cards.
 */
function bestColorForHand(hand: Card[], excludeCardId?: string): Color {
  const colorCount: Record<string, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const c of hand) {
    if (c.color && c.id !== excludeCardId) colorCount[c.color]++;
  }
  return (
    Object.entries(colorCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'red'
  ) as Color;
}

export function useAutoPlay(
  playCard: (cardId: string) => void,
  drawCard: () => void,
  chooseColor: (color: Color) => void,
  challenge: () => void,
): void {
  const autoPlay = useSettingsStore((s) => s.autoPlay);
  const isMyTurn = useIsMyTurn();
  const phase = useGameStore((s) => s.phase);
  const players = useGameStore((s) => s.players);
  const currentColor = useGameStore((s) => s.currentColor);
  const discardPile = useGameStore((s) => s.discardPile);
  const userId = useEffectiveUserId();
  const playableIds = usePlayableCardIds();

  const me = players.find((p) => p.id === userId);
  const topCard = discardPile[discardPile.length - 1];

  // Auto-play: playing phase — pick a card or draw
  useEffect(() => {
    if (!autoPlay || !isMyTurn || phase !== 'playing' || !me || !topCard || !currentColor) return;

    const hand = me.hand;

    if (playableIds.size === 0) {
      // No playable card — draw
      const timer = setTimeout(() => drawCard(), 600);
      return () => clearTimeout(timer);
    }

    // Strategy: prefer same-color cards, then first playable (sorted order), avoid wild if possible
    const COLOR_ORDER: Record<string, number> = { red: 0, blue: 1, green: 2, yellow: 3 };
    const sorted = [...hand].sort((a, b) => {
      const colorA = COLOR_ORDER[a.color ?? ''] ?? 99;
      const colorB = COLOR_ORDER[b.color ?? ''] ?? 99;
      if (colorA !== colorB) return colorA - colorB;
      return 0;
    });

    // 1) Same color non-wild cards
    let pick = sorted.find((c) => playableIds.has(c.id) && c.color === currentColor);
    // 2) Any non-wild playable
    if (!pick) pick = sorted.find((c) => playableIds.has(c.id) && c.color !== null);
    // 3) Wild card as last resort
    if (!pick) pick = sorted.find((c) => playableIds.has(c.id));

    if (pick) {
      const isWild = pick.type === 'wild' || pick.type === 'wild_draw_four';
      const timer = setTimeout(() => {
        playCard(pick.id);
        if (isWild) {
          const bestColor = bestColorForHand(hand, pick.id);
          setTimeout(() => chooseColor(bestColor), 300);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, isMyTurn, phase, me?.hand, topCard, currentColor, playableIds]);

  // Auto-play: handle non-playing phases (challenge/accept, color pick, swap target)
  useEffect(() => {
    if (!autoPlay || !isMyTurn) return;

    if (phase === 'challenging') {
      const timer = setTimeout(() => challenge(), 600);
      return () => clearTimeout(timer);
    }

    if (phase === 'choosing_color') {
      const hand = me?.hand ?? [];
      const bestColor = bestColorForHand(hand);
      const timer = setTimeout(() => chooseColor(bestColor), 600);
      return () => clearTimeout(timer);
    }

    if (phase === 'choosing_swap_target') {
      const targets = players.filter((p) => p.id !== userId && !p.eliminated);
      if (targets.length > 0) {
        const target = targets.reduce(
          (best, p) => (p.handCount > best.handCount ? p : best),
          targets[0]!,
        );
        const timer = setTimeout(() => {
          getSocket().emit('game:choose_swap_target', { targetId: target.id }, () => {});
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [autoPlay, isMyTurn, phase, me?.hand, players, userId]);
}

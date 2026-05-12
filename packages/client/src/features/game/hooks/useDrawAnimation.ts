import { useState, useRef, useEffect, useCallback } from 'react';
import type { GameAction, HouseRules } from '@uno-online/shared';
import { useGameStore } from '../stores/game-store';
import type { PlayerInfo } from '../stores/game-store';
import type { Position } from './usePlayerLayout';
import { playSound } from '@/shared/sound/sound-manager';

interface HandGainBump {
  id: number;
  count: number;
}

interface ActiveHandSwap {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  count: number;
}

interface HandSwapEffect {
  id: number;
  fromX: number;
}

let handGainBumpId = 0;
let handSwapId = 0;

export function useDrawAnimation(
  players: PlayerInfo[],
  dimensions: { width: number; height: number },
  userId: string | null | undefined,
  lastAction: GameAction | null,
  settings: { turnTimeLimit: number; targetScore: number; houseRules?: HouseRules } | null,
  direction: 'clockwise' | 'counter_clockwise',
  roundNumber: number,
  getPlayerPosition: (playerId: string) => Position | null,
  phase: string | null,
  currentPlayerIndex: number,
) {
  const [drawAnimLeft, setDrawAnimLeft] = useState<{ trigger: number; targetX: number; targetY: number }>({ trigger: 0, targetX: 0, targetY: 220 });
  const [drawAnimRight, setDrawAnimRight] = useState<{ trigger: number; targetX: number; targetY: number }>({ trigger: 0, targetX: 0, targetY: 220 });
  const [handGainBumps, setHandGainBumps] = useState<Map<string, HandGainBump>>(new Map());
  const [drawUntilCount, setDrawUntilCount] = useState(0);
  const prevHandCountsRef = useRef<Map<string, number>>(new Map());
  const drawUntilRef = useRef<{ playerId: string | null; count: number; handCount: number | null }>({ playerId: null, count: 0, handCount: null });
  const handGainTimersRef = useRef<Map<string, number>>(new Map());
  const drawAnimationTimersRef = useRef<number[]>([]);
  const handSwapEffectTimersRef = useRef<number[]>([]);
  const lastHandSwapActionKeyRef = useRef<string | null>(null);

  const [activeHandSwaps, setActiveHandSwaps] = useState<ActiveHandSwap[]>([]);
  const [handSwapEffects, setHandSwapEffects] = useState<Map<string, HandSwapEffect>>(new Map());

  const drawUntilEnabled = Boolean(settings?.houseRules?.drawUntilPlayable || settings?.houseRules?.deathDraw);

  const computeDrawTarget = useCallback((playerId: string) => {
    const pos = getPlayerPosition(playerId);
    if (!pos || dimensions.width === 0) return { x: 0, y: 220 };
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const isMe = playerId === userId;
    return { x: pos.x - cx, y: pos.y - cy + (isMe ? 92 : 58) };
  }, [getPlayerPosition, dimensions, userId]);

  const enqueueHandSwapAnimations = useCallback((routes: Array<{ fromId: string; toId: string; count: number }>) => {
    const swaps: ActiveHandSwap[] = [];
    const effects = new Map<string, HandSwapEffect>();

    for (const route of routes) {
      const from = getPlayerPosition(route.fromId);
      const to = getPlayerPosition(route.toId);
      if (!from || !to) continue;

      const id = ++handSwapId;
      effects.set(route.toId, {
        id,
        fromX: Math.max(-48, Math.min(48, from.x - to.x)),
      });

      if (route.count > 0) {
        swaps.push({
          id: `hand_swap_${id}`,
          from: { x: from.x, y: from.y + 54 },
          to: { x: to.x, y: to.y + 54 },
          count: route.count,
        });
      }
    }

    if (swaps.length > 0) {
      setActiveHandSwaps((prev) => [...prev, ...swaps]);
    }

    if (effects.size > 0) {
      setHandSwapEffects(effects);
      const timer = window.setTimeout(() => {
        setHandSwapEffects((prev) => {
          const next = new Map(prev);
          for (const [playerId, effect] of effects) {
            if (next.get(playerId)?.id === effect.id) {
              next.delete(playerId);
            }
          }
          return next;
        });
      }, 900);
      handSwapEffectTimersRef.current.push(timer);
    }
  }, [getPlayerPosition]);

  const handleHandSwapComplete = useCallback((id: string) => {
    setActiveHandSwaps((prev) => prev.filter((swap) => swap.id !== id));
  }, []);

  // Main draw animation effect
  useEffect(() => {
    for (const timer of drawAnimationTimersRef.current) {
      window.clearTimeout(timer);
    }
    drawAnimationTimersRef.current = [];

    if (players.length === 0 || dimensions.width === 0) return;
    const previous = prevHandCountsRef.current;
    const pile = useGameStore.getState().discardPile;
    const topCard = pile[pile.length - 1];
    const isZeroRotate =
      lastAction?.type === 'PLAY_CARD' &&
      settings?.houseRules?.zeroRotateHands &&
      topCard?.type === 'number' &&
      topCard.value === 0;
    const isSevenSwap = lastAction?.type === 'CHOOSE_SWAP_TARGET';
    const swapActionKey = isSevenSwap
      ? `${roundNumber}:seven:${lastAction.playerId}:${lastAction.targetId}`
      : isZeroRotate
        ? `${roundNumber}:zero:${lastAction.playerId}:${lastAction.cardId}`
        : null;

    if (previous.size > 0 && swapActionKey && lastHandSwapActionKeyRef.current !== swapActionKey) {
      lastHandSwapActionKeyRef.current = swapActionKey;

      if (isSevenSwap) {
        const actorCount = previous.get(lastAction.playerId) ?? 0;
        const targetCount = previous.get(lastAction.targetId) ?? 0;
        enqueueHandSwapAnimations([
          { fromId: lastAction.playerId, toId: lastAction.targetId, count: actorCount },
          { fromId: lastAction.targetId, toId: lastAction.playerId, count: targetCount },
        ]);
      } else if (isZeroRotate) {
        const routes = players.map((player, index) => {
          const sourceIndex = direction === 'clockwise'
            ? (index - 1 + players.length) % players.length
            : (index + 1) % players.length;
          const source = players[sourceIndex]!;
          const playedCardAdjustment = source.id === lastAction.playerId ? 1 : 0;
          return {
            fromId: source.id,
            toId: player.id,
            count: Math.max(0, (previous.get(source.id) ?? 0) - playedCardAdjustment),
          };
        });
        enqueueHandSwapAnimations(routes);
      }
    }

    const shouldAnimateDraw = lastAction?.type === 'DRAW_CARD';
    for (const player of players) {
      const before = previous.get(player.id);
      const after = player.handCount;
      if (shouldAnimateDraw && player.id === lastAction.playerId && before !== undefined && after > before) {
        const added = after - before;
        const bumpId = ++handGainBumpId;
        setHandGainBumps((prev) => {
          const next = new Map(prev);
          const current = next.get(player.id);
          next.set(player.id, { id: bumpId, count: (current?.count ?? 0) + added });
          return next;
        });
        const existingTimer = handGainTimersRef.current.get(player.id);
        if (existingTimer) {
          window.clearTimeout(existingTimer);
        }
        const removeTimer = window.setTimeout(() => {
          setHandGainBumps((prev) => {
            const current = prev.get(player.id);
            if (!current || current.id !== bumpId) return prev;
            const next = new Map(prev);
            next.delete(player.id);
            return next;
          });
          handGainTimersRef.current.delete(player.id);
        }, 3000);
        handGainTimersRef.current.set(player.id, removeTimer);

        const drawSide = (lastAction as { side?: string }).side;
        const setAnim = drawSide === 'right' ? setDrawAnimRight : setDrawAnimLeft;
        for (let i = 0; i < added; i++) {
          playSound('draw_card');
          const target = computeDrawTarget(player.id);
          const timer = window.setTimeout(() => {
            setAnim((prev) => ({
              trigger: prev.trigger + 1,
              targetX: target.x,
              targetY: target.y,
            }));
          }, i * 300);
          drawAnimationTimersRef.current.push(timer);
        }
      }
    }
    prevHandCountsRef.current = new Map(players.map((p) => [p.id, p.handCount]));
  }, [players, dimensions.width, computeDrawTarget, lastAction, settings, direction, roundNumber, enqueueHandSwapAnimations]);

  // Draw-until tracking effect
  useEffect(() => {
    if (!drawUntilEnabled || phase !== 'playing' || lastAction?.type !== 'DRAW_CARD') {
      drawUntilRef.current = { playerId: null, count: 0, handCount: null };
      setDrawUntilCount(0);
      return;
    }

    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer || lastAction.playerId !== currentPlayer.id) {
      drawUntilRef.current = { playerId: null, count: 0, handCount: null };
      setDrawUntilCount(0);
      return;
    }

    const previous = drawUntilRef.current;
    if (previous.playerId === lastAction.playerId && previous.handCount === currentPlayer.handCount) return;

    const nextCount = previous.playerId === lastAction.playerId ? previous.count + 1 : 1;
    drawUntilRef.current = { playerId: lastAction.playerId, count: nextCount, handCount: currentPlayer.handCount };
    setDrawUntilCount(nextCount);
  }, [drawUntilEnabled, phase, lastAction, players, currentPlayerIndex]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      for (const timer of drawAnimationTimersRef.current) {
        window.clearTimeout(timer);
      }
      for (const timer of handGainTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      for (const timer of handSwapEffectTimersRef.current) {
        window.clearTimeout(timer);
      }
      drawAnimationTimersRef.current = [];
      handGainTimersRef.current.clear();
      handSwapEffectTimersRef.current = [];
    };
  }, []);

  return {
    drawAnimLeft,
    drawAnimRight,
    drawUntilCount,
    handGainBumps,
    activeHandSwaps,
    handSwapEffects,
    handleHandSwapComplete,
  };
}

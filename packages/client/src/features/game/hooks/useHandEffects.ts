import { useState, useRef, useEffect } from 'react';
import type { CommittedGameAction, RoomSettings } from '@uno-online/shared';
import { useGameStore } from '../stores/game-store';
import type { PlayerInfo } from '../stores/game-store';
import type { Position } from './usePlayerLayout';

interface HandGainBump {
  id: number;
  count: number;
}

interface HandSwapEffect {
  id: number;
  fromX: number;
}

let handGainBumpId = 0;
let handSwapEffectId = 0;

/**
 * 桌面牌桌的手牌指示效果（不含飞行动画——飞行已由 fx/ViewportFxLayer 接管）：
 * - handGainBumps：摸牌后玩家头像旁的 +N 提示
 * - handSwapEffects：换手牌后手牌区的抖动入场
 * - drawUntilCount：村规「摸到能出为止」的已摸计数
 */
export function useHandEffects(
  players: PlayerInfo[],
  lastAction: CommittedGameAction | null,
  settings: RoomSettings | null,
  direction: 'clockwise' | 'counter_clockwise',
  roundNumber: number,
  getPlayerPosition: (playerId: string) => Position | null,
  phase: string | null,
  currentPlayerIndex: number,
) {
  const [handGainBumps, setHandGainBumps] = useState<Map<string, HandGainBump>>(new Map());
  const [drawUntilCount, setDrawUntilCount] = useState(0);
  const [handSwapEffects, setHandSwapEffects] = useState<Map<string, HandSwapEffect>>(new Map());

  const prevHandCountsRef = useRef<Map<string, number>>(new Map());
  const drawUntilRef = useRef<{ playerId: string | null; count: number; handCount: number | null }>({
    playerId: null,
    count: 0,
    handCount: null,
  });
  const handGainTimersRef = useRef<Map<string, number>>(new Map());
  const handSwapEffectTimersRef = useRef<number[]>([]);
  const lastHandSwapActionKeyRef = useRef<string | null>(null);

  const drawUntilEnabled = Boolean(settings?.houseRules.drawUntilPlayable);

  // 换手牌抖动 + 摸牌 +N：对 handCount 与 lastAction 做差分
  useEffect(() => {
    if (players.length === 0) return;
    const previous = prevHandCountsRef.current;
    const pile = useGameStore.getState().discardPile;
    const topCard = pile[pile.length - 1];
    const isZeroRotate =
      lastAction?.type === 'PLAY_CARD' &&
      settings?.houseRules.zeroRotateHands &&
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

      // 参与换手的玩家：按来源玩家的相对位置给一个横向抖动
      const routes: Array<{ fromId: string | null; toId: string }> = [];
      if (isSevenSwap) {
        routes.push(
          { fromId: lastAction.targetId, toId: lastAction.playerId },
          { fromId: lastAction.playerId, toId: lastAction.targetId },
        );
      } else if (isZeroRotate) {
        for (let index = 0; index < players.length; index++) {
          const sourceIndex =
            direction === 'clockwise' ? (index - 1 + players.length) % players.length : (index + 1) % players.length;
          routes.push({ fromId: players[sourceIndex]!.id, toId: players[index]!.id });
        }
      }

      const effects = new Map<string, HandSwapEffect>();
      for (const route of routes) {
        const to = getPlayerPosition(route.toId);
        if (!to) continue;
        const from = route.fromId ? getPlayerPosition(route.fromId) : null;
        const id = ++handSwapEffectId;
        effects.set(route.toId, {
          id,
          fromX: from ? Math.max(-48, Math.min(48, from.x - to.x)) : 0,
        });
      }

      if (effects.size > 0) {
        setHandSwapEffects(effects);
        const timer = window.setTimeout(() => {
          setHandSwapEffects(prev => {
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
    }

    // 摸牌 +N 提示
    const shouldAnimateDraw = lastAction?.type === 'DRAW_CARD';
    for (const player of players) {
      const before = previous.get(player.id);
      const after = player.handCount;
      if (shouldAnimateDraw && player.id === lastAction.playerId && before !== undefined && after > before) {
        const added = after - before;
        const bumpId = ++handGainBumpId;
        setHandGainBumps(prev => {
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
          setHandGainBumps(prev => {
            const current = prev.get(player.id);
            if (!current || current.id !== bumpId) return prev;
            const next = new Map(prev);
            next.delete(player.id);
            return next;
          });
          handGainTimersRef.current.delete(player.id);
        }, 3000);
        handGainTimersRef.current.set(player.id, removeTimer);
      }
    }
    prevHandCountsRef.current = new Map(players.map(p => [p.id, p.handCount]));
  }, [players, lastAction, settings, direction, roundNumber, getPlayerPosition]);

  // 「摸到能出为止」计数
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

  // 卸载时清理定时器
  useEffect(() => {
    return () => {
      for (const timer of handGainTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      for (const timer of handSwapEffectTimersRef.current) {
        window.clearTimeout(timer);
      }
      handGainTimersRef.current.clear();
      handSwapEffectTimersRef.current = [];
    };
  }, []);

  return {
    drawUntilCount,
    handGainBumps,
    handSwapEffects,
  };
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import ThrowAnimation from '../components/ThrowAnimation';
import HandSwapAnimation from '../components/HandSwapAnimation';
import DrawCardFlight from './DrawCardFlight';
import type { DrawFlight } from './DrawCardFlight';
import PlayCardFlight from './PlayCardFlight';
import type { PlayFlight } from './PlayCardFlight';
import { getDiscardSlotRect } from './coords';
import { useFxStore } from './fx-store';
import ChatBubble from '../components/ChatBubble';
import { useChatBubbles } from '../hooks/useChatBubbles';
import { getPlayerAnchor, getDrawPileAnchor } from './coords';
import type { ViewportPoint } from './coords';
import { getSocket } from '@/shared/socket';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { playSound, playThrowHitSound } from '@/shared/sound/sound-manager';

interface ThrowFx {
  id: string;
  from: ViewportPoint;
  to: ViewportPoint;
  item: string;
}

interface SwapFx {
  id: string;
  from: ViewportPoint;
  to: ViewportPoint;
  count: number;
}

let fxIdCounter = 0;
const nextFxId = (prefix: string) => `${prefix}_${++fxIdCounter}`;

/**
 * 统一视口特效层：portal 到 document.body，fixed 全屏覆盖。
 * 所有动画锚点都用 getBoundingClientRect 取视口坐标，
 * 因此桌面（FitScaler 缩放画布）和移动端（strip 布局）共用同一套实现。
 *
 * 负责四类表现：
 * 1. throw:item 投掷道具（emoji 飞行 + 命中粒子）
 * 2. 摸牌（牌背从 [data-draw-pile] 飞向 [data-player-id]）
 * 3. 换手牌（村规 7 换 / 0 轮转，牌背在两名玩家之间飞）
 * 4. 聊天气泡（按 [data-player-id] 锚点悬浮，不受任何容器裁切）
 *
 * 锚点元素缺失时跳过动画，不报错。
 */
export default function ViewportFxLayer() {
  const [throws, setThrows] = useState<ThrowFx[]>([]);
  const [draws, setDraws] = useState<DrawFlight[]>([]);
  const [swaps, setSwaps] = useState<SwapFx[]>([]);
  const [plays, setPlays] = useState<PlayFlight[]>([]);

  const players = useGameStore(s => s.players);
  const chatMessages = useChatBubbles();
  const lastAction = useGameStore(s => s.lastAction);
  const settings = useGameStore(s => s.settings);
  const direction = useGameStore(s => s.direction);
  const roundNumber = useGameStore(s => s.roundNumber);
  const userId = useEffectiveUserId();

  // socket 监听用 ref 读最新 userId，避免重复订阅
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const drawsRef = useRef<DrawFlight[]>([]);
  drawsRef.current = draws;
  const playsRef = useRef<PlayFlight[]>([]);
  playsRef.current = plays;
  const prevHandCountsRef = useRef<Map<string, number>>(new Map());
  const prevSelfHandIdsRef = useRef<string[]>([]);
  const lastHandSwapActionKeyRef = useRef<string | null>(null);

  const removeThrow = useCallback((id: string) => {
    setThrows(prev => prev.filter(t => t.id !== id));
  }, []);
  const removeDraw = useCallback((id: string) => {
    const flight = drawsRef.current.find(d => d.id === id);
    if (flight?.handCardId) useFxStore.getState().revealHandCard(flight.handCardId);
    setDraws(prev => prev.filter(d => d.id !== id));
  }, []);
  const removeSwap = useCallback((id: string) => {
    setSwaps(prev => prev.filter(s => s.id !== id));
  }, []);
  const removePlay = useCallback((id: string) => {
    const flight = playsRef.current.find(p => p.id === id);
    if (flight) useFxStore.getState().revealDiscardCard(flight.card.id);
    setPlays(prev => prev.filter(p => p.id !== id));
  }, []);

  // 1. 投掷道具：socket 广播 → 从投掷者锚点飞到目标锚点
  useEffect(() => {
    const socket = getSocket();
    const handler = (data: { fromId: string; targetId: string; item: string }) => {
      if (data.targetId === userIdRef.current) {
        playThrowHitSound(data.item);
      }
      const from = getPlayerAnchor(data.fromId);
      const to = getPlayerAnchor(data.targetId);
      if (!from || !to) return; // 观战者等无锚点场景：跳过动画
      setThrows(prev => [...prev, { id: nextFxId('throw'), from, to, item: data.item }]);
    };
    socket.on('throw:item', handler);
    return () => {
      socket.off('throw:item', handler);
    };
  }, []);

  // 2 + 3. 摸牌 / 换手牌：对 players 的 handCount 与 lastAction 做差分（逻辑沿用原 useDrawAnimation）
  useEffect(() => {
    const previous = prevHandCountsRef.current;

    // 换手牌（7 换 / 0 轮转）：按动作 key 去重，只触发一次
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

      const routes: Array<{ fromId: string; toId: string; count: number }> = [];
      if (isSevenSwap) {
        routes.push(
          { fromId: lastAction.playerId, toId: lastAction.targetId, count: previous.get(lastAction.playerId) ?? 0 },
          { fromId: lastAction.targetId, toId: lastAction.playerId, count: previous.get(lastAction.targetId) ?? 0 },
        );
      } else if (isZeroRotate) {
        for (let index = 0; index < players.length; index++) {
          const sourceIndex =
            direction === 'clockwise' ? (index - 1 + players.length) % players.length : (index + 1) % players.length;
          const source = players[sourceIndex]!;
          const playedCardAdjustment = source.id === lastAction.playerId ? 1 : 0;
          routes.push({
            fromId: source.id,
            toId: players[index]!.id,
            count: Math.max(0, (previous.get(source.id) ?? 0) - playedCardAdjustment),
          });
        }
      }

      const newSwaps: SwapFx[] = [];
      for (const route of routes) {
        if (route.count <= 0) continue;
        const from = getPlayerAnchor(route.fromId);
        const to = getPlayerAnchor(route.toId);
        if (!from || !to) continue;
        newSwaps.push({ id: nextFxId('swap'), from, to, count: route.count });
      }
      if (newSwaps.length > 0) {
        setSwaps(prev => [...prev, ...newSwaps]);
      }
    }

    // 摸牌：handCount 差分，新增几张就飞几张（错开 0.3s）。
    // 自己摸牌：新牌在手牌区隐形占位，飞牌落到各自的精确槽位后才现身（动画-状态同步）。
    if (lastAction?.type === 'DRAW_CARD') {
      for (const player of players) {
        const before = previous.get(player.id);
        const added = player.handCount - (before ?? player.handCount);
        if (player.id !== lastAction.playerId || before === undefined || added <= 0) continue;

        const from = getDrawPileAnchor(lastAction.side);
        const isSelfDraw = player.id === userIdRef.current;
        // 算出新摸的牌 id（仅自己，对手手牌不可见）
        let newCardIds: string[] = [];
        if (isSelfDraw) {
          const prevIds = prevSelfHandIdsRef.current;
          newCardIds = player.hand.map(c => c.id).filter(cid => !prevIds.includes(cid));
          if (newCardIds.length !== added) newCardIds = []; // 换手等复杂情况退化为锚点飞行
          if (newCardIds.length > 0) useFxStore.getState().hideHandCards(newCardIds);
        }
        const to = getPlayerAnchor(player.id);
        for (let i = 0; i < added; i++) {
          playSound('draw_card');
          if (!from || !to) continue; // 锚点缺失时只播音效
          const handCardId = newCardIds[i];
          // 自己：落点为那张牌的槽位（已渲染但隐形）；对手/退化：落点为玩家锚点
          let target = to;
          if (handCardId) {
            const slotEl = document.querySelector(`[data-card-id="${CSS.escape(handCardId)}"]`);
            const rect = slotEl?.getBoundingClientRect();
            if (rect && rect.width > 0) target = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          }
          const id = nextFxId('draw');
          const toSize = isSelfDraw ? 'hand' : 'avatar';
          const delay = handCardId ? 0.05 + i * 0.15 : i * 0.3;
          setDraws(prev => [...prev, { id, from, to: target, delay, toSize, handCardId }]);
        }
      }
    }

    // 出牌飞行（两种模式统一由特效层呈现：从出牌者位置飞向弃牌槽）。
    // 飞牌未落地时弃牌堆仍显示上一张顶牌，落地瞬间才更新（动画-状态同步）。
    if (lastAction?.type === 'PLAY_CARD') {
      const pile2 = useGameStore.getState().discardPile;
      const playedCard = pile2[pile2.length - 1];
      const slot = getDiscardSlotRect();
      if (playedCard && slot) {
        const isSelf = lastAction.playerId === userIdRef.current;
        // 自己：优先用点击时记录的精确槽位；否则退化为玩家锚点
        const from =
          (isSelf && useFxStore.getState().takePlayOrigin(playedCard.id)) || getPlayerAnchor(lastAction.playerId);
        if (from) {
          useFxStore.getState().hideDiscardCard(playedCard.id);
          const id = nextFxId('play');
          // 去重：同一 topCard 只飞一次
          setPlays(prev =>
            prev.some(p => p.card.id === playedCard.id)
              ? prev
              : [
                  ...prev,
                  { id, from, to: { x: slot.x, y: slot.y }, card: playedCard, isSelf, toW: slot.w, toH: slot.h },
                ],
          );
        }
      }
    }

    prevHandCountsRef.current = new Map(players.map(p => [p.id, p.handCount]));
    const selfPlayer = players.find(p => p.id === userIdRef.current);
    if (selfPlayer) prevSelfHandIdsRef.current = selfPlayer.hand.map(c => c.id);
  }, [players, lastAction, settings, direction, roundNumber]);

  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-effects" data-fx-layer>
      <AnimatePresence>
        {throws.map(t => (
          <ThrowAnimation key={t.id} from={t.from} to={t.to} item={t.item} onComplete={() => removeThrow(t.id)} />
        ))}
      </AnimatePresence>
      {draws.map(d => (
        <DrawCardFlight key={d.id} flight={d} onComplete={() => removeDraw(d.id)} />
      ))}
      {plays.map(p => (
        <PlayCardFlight key={p.id} flight={p} onComplete={() => removePlay(p.id)} />
      ))}
      <AnimatePresence>
        {swaps.map(s => (
          <HandSwapAnimation key={s.id} swap={s} onComplete={() => removeSwap(s.id)} />
        ))}
      </AnimatePresence>
      {/* 聊天气泡：锚点悬浮，头像正上方 */}
      {[...chatMessages.entries()].map(([playerId, text]) => {
        const anchor = getPlayerAnchor(playerId);
        if (!anchor) return null;
        return (
          <div key={playerId} className="fixed" style={{ left: anchor.x, top: anchor.y - 8 }}>
            <ChatBubble message={text} visible />
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

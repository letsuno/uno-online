import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card as CardType, Color } from '@uno-online/shared';
import { sortHand, isWildCard } from '@uno-online/shared';
import Card from '../Card';
import ColorPicker from '../ColorPicker';
import { useGameStore } from '../../stores/game-store';
import { useFxStore } from '../../fx/fx-store';
import { useEffectiveUserId } from '../../hooks/useEffectiveUserId';
import { useIsMyTurn } from '../../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../../hooks/usePlayableCardIds';
import { cn } from '@/shared/lib/utils';

const CARD_W = 84;
const CARD_H = 120;
/** 牌多时的槽位宽（重叠程度）：被遮牌也保留至少这么多可点区域 */
const OVERLAP_STRIDE = 44;
const BOUNDARY_GAP = 14;
const RAISE = 36;
/** 双指捏合调间距的范围与持久化 key */
const SPREAD_MIN = 0.7;
const SPREAD_MAX = 1.6;
const SPREAD_KEY = 'mobileHandSpread';

function touchDist(touches: TouchList): number {
  const [a, b] = [touches[0]!, touches[1]!];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

interface MobileHandProps {
  onPlayCard: (cardId: string, chosenColor?: Color) => void;
}

function isColorBoundary(sorted: CardType[], index: number): boolean {
  if (index === 0) return false;
  const prev = sorted[index - 1]!;
  const curr = sorted[index]!;
  const prevIsWild = isWildCard(prev);
  const currIsWild = isWildCard(curr);
  if (prevIsWild !== currIsWild) return true;
  if (!prevIsWild && !currIsWild && prev.color !== curr.color) return true;
  return false;
}

/**
 * 移动端手牌区（全新实现，不与桌面 PlayerHand 共用逻辑）：
 * - 原生横向滚动（touch 惯性），牌少时间距摊开居中，牌多时固定槽位重叠滑动
 * - 点一下：牌抬起放大（自动滚入视野）；再点一下：出牌
 * - 滑动选牌：按住牌稍作停留后横向拖动，经过的牌依次抬起，边缘自动滚动，松开即选中
 * - 上滑出牌：按住牌向上滑出阈值后松手直接打出（不可出则弹回）；快速横滑仍是滚动
 * - 双指捏合调整牌距（持久化）
 * - 可出牌金色发光、不可出置灰；万能牌叠加场景先弹选色
 */
export default function MobileHand({ onPlayCard }: MobileHandProps) {
  const userId = useEffectiveUserId();
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const settings = useGameStore((s) => s.settings);
  const drawStack = useGameStore((s) => s.drawStack);
  const discardPile = useGameStore((s) => s.discardPile);

  const me = players.find((p) => p.id === userId);
  const isMyTurn = useIsMyTurn();
  const playableIds = usePlayableCardIds();
  const hintedIds = settings?.houseRules?.noHints ? new Set<string>() : playableIds;
  const sorted = useMemo(() => sortHand(me?.hand ?? []), [me?.hand]);

  const hiddenHandCardIds = useFxStore((s) => s.hiddenHandCardIds);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingColorCardId, setPendingColorCardId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 双指捏合缩放牌距（持久化）
  const [spread, setSpread] = useState(() => {
    const v = Number(localStorage.getItem(SPREAD_KEY));
    return v >= SPREAD_MIN && v <= SPREAD_MAX ? v : 1;
  });
  const spreadRef = useRef(spread);
  spreadRef.current = spread;
  const pinchRef = useRef<{ startDist: number; startSpread: number; latest: number } | null>(null);

  // ---- 单指手势（滑动选牌 / 上滑出牌）----
  // 上滑拖拽中的牌、纵向偏移与是否已达打出线（松手后清空，牌弹回或打出）
  const [dragState, setDragState] = useState<{ id: string; dy: number; canPlay: boolean } | null>(null);
  // 容器 overflow 放开标记：松手回弹（弹簧 ~0.4s）期间保持放开，否则回弹中的牌会被容器上沿裁断
  const [dragOverflowFree, setDragOverflowFree] = useState(false);
  useEffect(() => {
    if (dragState) {
      setDragOverflowFree(true);
      return;
    }
    const t = setTimeout(() => setDragOverflowFree(false), 500);
    return () => clearTimeout(t);
  }, [dragState]);
  // 拖拽手势已处理选择/出牌时，抑制随后的 click（避免 tap 逻辑重复触发）
  const suppressClickRef = useRef(false);
  const gestureRef = useRef<{
    touchId: number;
    cardId: string;
    x0: number;
    y0: number;
    t0: number;
    /** 打出线：手牌区容器上沿，松手时手指在其上方才算打出（防误触） */
    playLineY: number;
    mode: 'undecided' | 'scroll' | 'hold' | 'browse' | 'play';
    lastX: number;
    lastY: number;
  } | null>(null);
  const edgeScrollIvRef = useRef<number | null>(null);
  // 原生 touch 监听器（[] 依赖）通过 ref 读最新数据
  const dataRef = useRef({ sorted, playableIds });
  dataRef.current = { sorted, playableIds };

  /** 确认出牌（可出校验 + 选色 + 飞牌起点），tap 与上滑共用 */
  const confirmPlay = (card: CardType): boolean => {
    if (!dataRef.current.playableIds.has(card.id)) return false;
    if (shouldPickColorBeforePlay(card)) {
      setPendingColorCardId(card.id);
      return true;
    }
    // 出牌前记录精确槽位，飞牌从这里起飞
    const el = scrollRef.current?.querySelector(`[data-card-id="${card.id}"]`);
    const rect = el?.getBoundingClientRect();
    if (rect) useFxStore.getState().setPlayOrigin(card.id, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    onPlayCard(card.id);
    setSelectedId(null);
    return true;
  };
  const confirmPlayRef = useRef(confirmPlay);
  confirmPlayRef.current = confirmPlay;
  // hold 模式 preventDefault 会抑制 click，松手时需手动走 tap 逻辑
  const tapRef = useRef<(card: CardType) => void>(() => {});
  tapRef.current = (card) => handleTap(card);

  // React 的 touch 监听是 passive 的，preventDefault 需要原生监听
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const stopEdgeScroll = () => {
      if (edgeScrollIvRef.current != null) {
        clearInterval(edgeScrollIvRef.current);
        edgeScrollIvRef.current = null;
      }
    };
    // 浏览模式命中检测：在牌列底部边缘取样（抬起的牌上移了 RAISE，盖不到这里），
    // 避免命中「已抬起牌」导致选中滞后一张
    const hitCardId = (x: number, y?: number): string | null => {
      const rect = scrollRef.current?.getBoundingClientRect();
      const sampleY = rect ? rect.bottom - 16 : (y ?? 0);
      return (document.elementFromPoint(x, sampleY)?.closest('[data-card-id]') as HTMLElement | null)?.dataset.cardId ?? null;
    };
    // 浏览模式下手指停在屏幕边缘时自动滚动手牌，并重新命中指下的牌
    const startEdgeScroll = () => {
      if (edgeScrollIvRef.current != null) return;
      edgeScrollIvRef.current = window.setInterval(() => {
        const g = gestureRef.current;
        const container = scrollRef.current;
        if (!g || !container || g.mode !== 'browse') return;
        const vw = container.clientWidth;
        if (g.lastX < 44) container.scrollLeft -= 16;
        else if (g.lastX > vw - 44) container.scrollLeft += 16;
        else return;
        const hit = hitCardId(g.lastX, g.lastY);
        if (hit) setSelectedId(hit);
      }, 30);
    };

    const onStart = (e: TouchEvent) => {
      // 多点触控是逐个手指 touchstart 的：第二指落下时 touches.length 才为 2
      if (e.touches.length === 2) {
        pinchRef.current = { startDist: touchDist(e.touches), startSpread: spreadRef.current, latest: spreadRef.current };
        // 双指捏合接管：取消进行中的单指手势
        if (gestureRef.current) {
          gestureRef.current = null;
          setDragState(null);
          stopEdgeScroll();
        }
        return;
      }
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      const cardId = (t.target as HTMLElement).closest('[data-card-id]')?.getAttribute('data-card-id');
      if (!cardId) return;
      gestureRef.current = {
        touchId: t.identifier, cardId,
        x0: t.clientX, y0: t.clientY, t0: Date.now(),
        playLineY: (scrollRef.current?.getBoundingClientRect().top ?? t.clientY) - 4,
        mode: 'undecided', lastX: t.clientX, lastY: t.clientY,
      };
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault(); // 阻止页面缩放与横滑
        const ratio = touchDist(e.touches) / pinchRef.current.startDist;
        const next = Math.min(SPREAD_MAX, Math.max(SPREAD_MIN, pinchRef.current.startSpread * ratio));
        pinchRef.current.latest = next; // state 异步，touchend 持久化要用这个同步值
        setSpread(next);
        return;
      }
      const g = gestureRef.current;
      if (!g || g.mode === 'scroll') return;
      const t = [...e.changedTouches].find((x) => x.identifier === g.touchId);
      if (!t) return;
      g.lastX = t.clientX;
      g.lastY = t.clientY;
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;
      const elapsed = Date.now() - g.t0;
      // 浏览器可能已在判定窗口内接管了原生滚动（不可 cancel），此时让位滚动而不是报错
      const tryPrevent = (): boolean => {
        if (e.cancelable) {
          e.preventDefault();
          return true;
        }
        g.mode = 'scroll';
        setDragState(null);
        stopEdgeScroll();
        return false;
      };
      // 跟手拖拽状态：附带是否已过打出线（手指拖出手牌区上沿）
      const updateDrag = (dy: number) =>
        setDragState({ id: g.cardId, dy, canPlay: t.clientY < g.playLineY });

      if (g.mode === 'undecided') {
        // 首个 move 必须当场决断：一旦放过未 cancel 的 move，浏览器会锁定本次触摸
        // 为原生滚动（后续全 cancelable=false），手势就再也接管不了
        if (Math.abs(dx) >= 6 && Math.abs(dx) > Math.abs(dy) * 1.5 && elapsed < 140) {
          g.mode = 'scroll'; // 明显横向快滑：交还原生滚动（保留惯性）
          return;
        }
        if (!tryPrevent()) return;
        if (dy < -10) {
          // 上滑出牌：立即抬起跟手（未过打出线松手弹回，轻微抖动无害）
          g.mode = 'play';
          setSelectedId(g.cardId);
          updateDrag(Math.min(0, dy));
        } else {
          g.mode = 'hold'; // 垂直/微动：按住，等浏览判定
        }
        return;
      }

      if (g.mode === 'hold') {
        if (!tryPrevent()) return;
        if (dy < -14 && Math.abs(dy) > Math.abs(dx)) {
          g.mode = 'play';
          setSelectedId(g.cardId);
          updateDrag(Math.min(0, dy));
          return;
        }
        if (elapsed >= 140) {
          // 按住停留：进入浏览选牌
          g.mode = 'browse';
          setSelectedId(g.cardId);
          startEdgeScroll();
        }
        return;
      }

      if (g.mode === 'browse') {
        if (!tryPrevent()) return;
        if (dy < -50 && Math.abs(dy) > Math.abs(dx)) {
          // 浏览中向上提：切换为上滑出牌（打当前指下的牌）
          g.mode = 'play';
          g.cardId = hitCardId(t.clientX, t.clientY) ?? g.cardId;
          setSelectedId(g.cardId);
          updateDrag(Math.min(0, dy));
          stopEdgeScroll();
          return;
        }
        const hit = hitCardId(t.clientX, t.clientY);
        if (hit) setSelectedId(hit);
        return;
      }

      // play：牌跟手上下移动
      if (!tryPrevent()) return;
      updateDrag(Math.max(-320, Math.min(24, dy)));
    };

    const onEnd = (e: TouchEvent) => {
      if (pinchRef.current) {
        localStorage.setItem(SPREAD_KEY, String(pinchRef.current.latest));
        pinchRef.current = null;
      }
      const g = gestureRef.current;
      if (!g) return;
      const t = [...e.changedTouches].find((x) => x.identifier === g.touchId);
      if (!t) return;
      gestureRef.current = null;
      stopEdgeScroll();

      if (g.mode === 'hold') {
        // hold 里 preventDefault 抑制了 click，手动补一次 tap（选择/确认/取消）
        const card = dataRef.current.sorted.find((c) => c.id === g.cardId);
        if (card) tapRef.current(card);
        return;
      }
      if (g.mode === 'browse') {
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 300);
        return; // 选中保持抬起，等下一次 tap/上滑打出
      }
      if (g.mode === 'play') {
        suppressClickRef.current = true;
        setTimeout(() => { suppressClickRef.current = false; }, 300);
        // 只有松手时手指已拖出手牌区上沿才打出，区内松手一律弹回（防误触）
        if (t.clientY < g.playLineY) {
          const card = dataRef.current.sorted.find((c) => c.id === g.cardId);
          if (card) confirmPlayRef.current(card);
        }
        setDragState(null); // 未过打出线或不可出：弹回
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      stopEdgeScroll();
    };
  }, []);

  // 容器宽度测量（决定摊开还是重叠）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 手牌变化后清理失效选中
  useEffect(() => {
    if (selectedId && !sorted.some((c) => c.id === selectedId)) setSelectedId(null);
  }, [sorted, selectedId]);

  // 轮到我时，把第一张可出的牌滚入视野
  useEffect(() => {
    if (!isMyTurn || phase !== 'playing') return;
    const first = sorted.find((c) => playableIds.has(c.id));
    if (!first) return;
    const el = scrollRef.current?.querySelector(`[data-card-id="${first.id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, phase]);

  const count = sorted.length;
  const stride = useMemo(() => {
    if (count <= 1 || containerWidth <= 0) return CARD_W;
    const available = containerWidth - 24;
    const spreadStride = (available - CARD_W) / (count - 1);
    // 摊得开就摊开（不超过牌宽 + 8 间距），摊不开用固定重叠槽位（原生滚动）；
    // 最后乘双指捏合的缩放系数
    return Math.max(16, Math.max(OVERLAP_STRIDE, Math.min(CARD_W + 8, spreadStride)) * spread);
  }, [count, containerWidth, spread]);
  const baseWidth = count > 0 ? CARD_W + stride * (count - 1) + BOUNDARY_GAP * Math.max(0, count > 1 ? sorted.filter((_, i) => isColorBoundary(sorted, i)).length : 0) : 0;
  const centered = baseWidth > 0 && baseWidth <= containerWidth - 24;

  const topCard = discardPile[discardPile.length - 1];
  const houseRules = settings?.houseRules;
  const shouldPickColorBeforePlay = (card: CardType) => {
    if (card.type !== 'wild_draw_four' || !houseRules || !topCard) return false;
    if (phase !== 'challenging' && drawStack <= 0) return false;
    const canStack =
      (houseRules.stackDrawFour && topCard.type === 'wild_draw_four') ||
      (houseRules.crossStack && (topCard.type === 'draw_two' || topCard.type === 'wild_draw_four'));
    return canStack;
  };

  const handleTap = (card: CardType) => {
    if (suppressClickRef.current) return; // 拖拽手势刚结束，忽略残余 click
    if (selectedId !== card.id) {
      setSelectedId(card.id);
      // 把选中牌滚入视野
      const el = scrollRef.current?.querySelector(`[data-card-id="${card.id}"]`);
      el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
      return;
    }
    // 第二次点击：可出则出牌；不可出则取消选中（避免卡在选择态）
    if (!playableIds.has(card.id)) {
      setSelectedId(null);
      return;
    }
    confirmPlay(card);
  };

  // 选中后点页面任意非牌位置取消（capture 阶段，不影响其他按钮正常触发）
  useEffect(() => {
    if (!selectedId) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('[data-card-id]')) setSelectedId(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [selectedId]);

  if (!me) return null;

  return (
    <div className="relative z-actions shrink-0" data-player-id={me.id}>
      {pendingColorCardId && (
        <ColorPicker
          onPick={(color) => {
            onPlayCard(pendingColorCardId, color);
            setPendingColorCardId(null);
            setSelectedId(null);
          }}
        />
      )}
      {/* 上滑拖拽提示：过线变「松手打出」 */}
      <AnimatePresence>
        {dragState && (
          <motion.div
            key="drag-hint"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute left-1/2 -translate-x-1/2 -top-9 z-fab pointer-events-none',
              'rounded-full px-3 py-1 text-xs font-game font-bold whitespace-nowrap',
              dragState.canPlay
                ? 'bg-primary text-primary-foreground shadow-[0_0_14px_rgba(251,191,36,0.6)]'
                : 'bg-black/60 text-white/70',
            )}
          >
            {dragState.canPlay ? '松手打出' : '拖出手牌区打出'}
          </motion.div>
        )}
      </AnimatePresence>
      <div
        ref={scrollRef}
        className={cn(
          'overflow-x-auto scrollbar-hidden px-3 pt-10 pb-3',
          centered && 'flex justify-center',
        )}
        // 上滑拖拽时牌要飞出手牌区上沿，overflow-x:auto 会把 y 方向也算成 auto 裁掉；
        // 拖拽及松手回弹期间放开（回弹约 0.4s，提前恢复会把回弹中的牌裁断）
        style={{ touchAction: 'pan-x', ...(dragOverflowFree ? { overflow: 'visible' } : {}) }}
      >
        <div className="relative flex items-end" style={{ height: CARD_H + RAISE, width: baseWidth || '100%' }}>
          <AnimatePresence mode="popLayout">
          {sorted.map((card, i) => {
            const isPlayable = playableIds.has(card.id);
            const isDimmed = isMyTurn && phase === 'playing' && !hintedIds.has(card.id);
            const isSelected = selectedId === card.id;
            const isDragging = dragState?.id === card.id;
            const canPlayNow = isDragging && dragState!.canPlay;
            const boundary = isColorBoundary(sorted, i);
            return (
              <motion.button
                key={card.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.85 }}
                animate={{
                  opacity: 1,
                  y: isDragging ? -RAISE + dragState!.dy : isSelected ? -RAISE : 0,
                  scale: isDragging ? (canPlayNow ? 1.14 : 1.1) : isSelected ? 1.06 : 1,
                  zIndex: isDragging ? 50 : isSelected ? 40 : i,
                }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={isDragging ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 30 }}
                data-card-id={card.id}
                onClick={() => handleTap(card)}
                className="relative shrink-0 bg-transparent border-0 p-0 cursor-pointer"
                style={{
                  width: i === count - 1 ? CARD_W : stride,
                  height: CARD_H,
                  marginLeft: boundary ? BOUNDARY_GAP : 0,
                }}
              >
                <span
                  className={cn(
                    'absolute left-0 bottom-0 block transition-all duration-150',
                    isDimmed && 'brightness-[0.45] saturate-[0.7]',
                    isPlayable && isMyTurn && !isSelected && '-translate-y-1',
                    hiddenHandCardIds.has(card.id) && 'opacity-0',
                  )}
                  style={{
                    width: CARD_W, height: CARD_H,
                    filter: canPlayNow
                      ? 'drop-shadow(0 0 16px rgba(251,191,36,0.9))'
                      : isPlayable && isMyTurn
                        ? 'drop-shadow(0 0 10px rgba(251,191,36,0.45))'
                        : undefined,
                  }}
                >
                  <Card
                    card={card}
                    playable={isPlayable && isMyTurn}
                    dimmed={isDimmed}
                    forceCornerLabel
                    disableHoverLift
                    style={{ width: CARD_W, height: CARD_H }}
                  />
                </span>
              </motion.button>
            );
          })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

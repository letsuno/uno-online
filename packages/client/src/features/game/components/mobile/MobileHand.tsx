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

  // React 的 touch 监听是 passive 的，preventDefault 需要原生监听
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      // 多点触控是逐个手指 touchstart 的：第二指落下时 touches.length 才为 2
      if (e.touches.length === 2) {
        pinchRef.current = { startDist: touchDist(e.touches), startSpread: spreadRef.current, latest: spreadRef.current };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault(); // 阻止页面缩放与横滑
      const ratio = touchDist(e.touches) / pinchRef.current.startDist;
      const next = Math.min(SPREAD_MAX, Math.max(SPREAD_MIN, pinchRef.current.startSpread * ratio));
      pinchRef.current.latest = next; // state 异步，touchend 持久化要用这个同步值
      setSpread(next);
    };
    const onEnd = () => {
      if (!pinchRef.current) return;
      localStorage.setItem(SPREAD_KEY, String(pinchRef.current.latest));
      pinchRef.current = null;
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
    if (shouldPickColorBeforePlay(card)) {
      setPendingColorCardId(card.id);
      return;
    }
    // 出牌前记录精确槽位，飞牌从这里起飞
    const el = scrollRef.current?.querySelector(`[data-card-id="${card.id}"]`);
    const rect = el?.getBoundingClientRect();
    if (rect) useFxStore.getState().setPlayOrigin(card.id, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    onPlayCard(card.id);
    setSelectedId(null);
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
      <div
        ref={scrollRef}
        className={cn(
          'overflow-x-auto scrollbar-hidden px-3 pt-10 pb-3',
          centered && 'flex justify-center',
        )}
        style={{ touchAction: 'pan-x' }}
      >
        <div className="relative flex items-end" style={{ height: CARD_H + RAISE, width: baseWidth || '100%' }}>
          <AnimatePresence mode="popLayout">
          {sorted.map((card, i) => {
            const isPlayable = playableIds.has(card.id);
            const isDimmed = isMyTurn && phase === 'playing' && !hintedIds.has(card.id);
            const isSelected = selectedId === card.id;
            const boundary = isColorBoundary(sorted, i);
            return (
              <motion.button
                key={card.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.85 }}
                animate={{
                  opacity: 1,
                  y: isSelected ? -RAISE : 0,
                  scale: isSelected ? 1.06 : 1,
                  zIndex: isSelected ? 40 : i,
                }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
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
                    filter: isPlayable && isMyTurn ? 'drop-shadow(0 0 10px rgba(251,191,36,0.45))' : undefined,
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

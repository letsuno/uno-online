import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { Card as CardType, Color } from '@uno-online/shared';
import { sortHand, isWildCard } from '@uno-online/shared';
import AnimatedCard from './AnimatedCard';
import { useGameStore } from '../stores/game-store';
import { useFxStore } from '../fx/fx-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useIsMyTurn } from '../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../hooks/usePlayableCardIds';
import ColorPicker from './ColorPicker';

interface PlayerHandProps {
  onPlayCard: (cardId: string, chosenColor?: Color) => void;
}

interface HandLayout {
  cardWidth: number;
  cardHeight: number;
  stride: number;
  baseWidth: number;
  padX: number;
  scrollable: boolean;
}

const CARD_WIDTH = 70;
const CARD_HEIGHT = 100;
const HAND_SIDE_PADDING = 20;
const COMFORTABLE_STRIDE = 78;
const ACTIVE_SCALE = 1.12;
const NEAR_EXPAND = 16;
const TOUCH_DRAG_THRESHOLD = 5;

/**
 * 移动端手牌尺寸档位：牌越多单张越小，保证任何牌数下全部牌都在屏内、
 * 相邻牌距（可点区域）不小于档位的最小 stride。超过 24 张才退化为横向滚动。
 */
const MOBILE_TIERS = [
  { max: 7, w: 84, h: 120, minStride: 40 },
  { max: 10, w: 70, h: 102, minStride: 32 },
  { max: 14, w: 56, h: 82, minStride: 26 },
  { max: 20, w: 44, h: 66, minStride: 20 },
  { max: Infinity, w: 36, h: 52, minStride: 14 },
] as const;

function getSpreadAngle(count: number): number {
  if (count <= 5) return 5;
  if (count <= 10) return 3;
  return 1.8;
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

function calculateHandLayout(count: number, containerWidth: number, reserved = 0): HandLayout {
  const isMobile = containerWidth > 0 && containerWidth < 768;

  if (isMobile) {
    const tier = MOBILE_TIERS.find((t) => count <= t.max) ?? MOBILE_TIERS[MOBILE_TIERS.length - 1];
    const cardWidth = tier.w;
    const cardHeight = tier.h;
    if (count <= 0 || containerWidth <= 0) {
      return { cardWidth, cardHeight, stride: cardWidth, baseWidth: cardWidth, padX: 8, scrollable: false };
    }
    const available = Math.max(cardWidth, containerWidth - 16);
    // fitStride 同时扣除扩展预留（边界间隙 + 悬停扩展），保证极端情况也不出屏
    const fitStride = count === 1 ? cardWidth : (available - cardWidth - reserved) / (count - 1);
    // 舒适间距不超过牌宽 80%；放不下时压到 fitStride（始终保证全部在屏内）
    const comfortable = Math.max(tier.minStride, Math.min(cardWidth * 0.8, fitStride));
    const stride = Math.max(10, comfortable);
    const baseWidth = cardWidth + stride * (count - 1);
    const scrollable = baseWidth > available;
    const padX = scrollable ? 8 : Math.max(8, (containerWidth - baseWidth - reserved) / 2);
    return { cardWidth, cardHeight, stride, baseWidth, padX, scrollable };
  }

  const cardWidth = CARD_WIDTH;
  const cardHeight = CARD_HEIGHT;
  if (count <= 0 || containerWidth <= 0) {
    return { cardWidth, cardHeight, stride: cardWidth, baseWidth: cardWidth, padX: HAND_SIDE_PADDING, scrollable: false };
  }

  const available = Math.max(cardWidth, containerWidth - HAND_SIDE_PADDING * 2);
  const fitStride = count === 1 ? cardWidth : (available - cardWidth) / (count - 1);
  const stride = Math.min(COMFORTABLE_STRIDE, Math.max(10, fitStride));
  const baseWidth = cardWidth + stride * (count - 1);
  // 居中时为右侧的边界间隙与悬停扩展预留 reserved，保证内容不超出容器
  const padX = Math.max(8, (containerWidth - baseWidth - reserved) / 2);

  return { cardWidth, cardHeight, stride, baseWidth, padX, scrollable: false };
}

function getNearestCardIndex(
  clientX: number,
  rect: DOMRect,
  scrollLeft: number,
  layout: HandLayout,
  count: number,
  boundaryOffsets: number[],
): number | null {
  if (count <= 0) return null;
  const x = clientX - rect.left + scrollLeft - layout.padX;
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    const cardX = i * layout.stride + (boundaryOffsets[i] ?? 0);
    const distance = Math.abs(x - cardX);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }
  return nearestIndex;
}

export default function PlayerHand({ onPlayCard }: PlayerHandProps) {
  const handViewportRef = useRef<HTMLDivElement>(null);
  const handDragRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    scrollLeft: 0,
    hasDragged: false,
    suppressClick: false,
  });
  const hiddenHandCardIds = useFxStore((s) => s.hiddenHandCardIds);
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
  const [pendingColorCardId, setPendingColorCardId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isDraggingHand, setIsDraggingHand] = useState(false);

  const isMobile = containerWidth > 0 && containerWidth < 768;
  const activeLift = isMobile ? 44 : 20;

  const boundaryGap = Math.min(10, Math.max(3, 78 * 0.35));
  const boundaryOffsets = useMemo(() => {
    let offset = 0;
    return sorted.map((_, index) => {
      if (isColorBoundary(sorted, index)) offset += boundaryGap;
      return offset;
    });
  }, [sorted, boundaryGap]);
  const layout = useMemo(
    () => calculateHandLayout(
      sorted.length,
      containerWidth,
      (boundaryOffsets[boundaryOffsets.length - 1] ?? 0) + NEAR_EXPAND * 2,
    ),
    [sorted.length, containerWidth, boundaryOffsets],
  );

  useEffect(() => {
    const el = handViewportRef.current;
    if (!el) return;

    const update = () => setContainerWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setActiveIndex((prev) => {
      if (prev === null) return null;
      return sorted.length === 0 ? null : Math.min(prev, sorted.length - 1);
    });
  }, [sorted.length]);

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

  const setActiveFromPointer = (clientX: number) => {
    const el = handViewportRef.current;
    if (!el) return;
    const index = getNearestCardIndex(clientX, el.getBoundingClientRect(), el.scrollLeft, layout, sorted.length, boundaryOffsets);
    setActiveIndex(index);
  };

  const handleHandPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const scrollEl = handViewportRef.current;
    if (!scrollEl) return;

    handDragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: scrollEl.scrollLeft,
      hasDragged: false,
      suppressClick: false,
    };
    setActiveFromPointer(event.clientX);
  };

  const handleHandPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    setActiveFromPointer(event.clientX);

    const drag = handDragRef.current;
    const scrollEl = handViewportRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId || !scrollEl) return;

    const deltaX = event.clientX - drag.startX;
    if (Math.abs(deltaX) > TOUCH_DRAG_THRESHOLD) {
      drag.hasDragged = true;
      drag.suppressClick = true;
      if (layout.scrollable) {
        setIsDraggingHand(true);
        if (!scrollEl.hasPointerCapture(event.pointerId)) {
          scrollEl.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        scrollEl.scrollLeft = drag.scrollLeft - deltaX;
        setActiveFromPointer(event.clientX);
      }
    }
  };

  const handleHandPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = handDragRef.current;
    const scrollEl = handViewportRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    drag.active = false;
    setIsDraggingHand(false);
    if (scrollEl?.hasPointerCapture(event.pointerId)) {
      scrollEl.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => { handDragRef.current.suppressClick = false; }, 0);
  };

  const handleHandPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = handDragRef.current;
    const scrollEl = handViewportRef.current;
    if (drag.pointerId === event.pointerId) {
      drag.active = false;
      drag.suppressClick = false;
      setIsDraggingHand(false);
      setActiveIndex(null);
    }
    if (scrollEl?.hasPointerCapture(event.pointerId)) {
      scrollEl.releasePointerCapture(event.pointerId);
    }
  };

  const handleHandClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!handDragRef.current.suppressClick) return;
    handDragRef.current.suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const playSelectedCard = () => {
    if (activeIndex === null || handDragRef.current.suppressClick) return;
    const card = sorted[activeIndex];
    if (!card || !playableIds.has(card.id)) return;
    if (shouldPickColorBeforePlay(card)) {
      setPendingColorCardId(card.id);
      return;
    }
    // 出牌前记录精确槽位，飞牌从这里起飞
    const el = handViewportRef.current?.querySelector(`[data-card-id="${card.id}"]`);
    const rect = el?.getBoundingClientRect();
    if (rect) useFxStore.getState().setPlayOrigin(card.id, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    onPlayCard(card.id);
  };

  const handHeight = layout.cardHeight + activeLift + (isMobile ? 20 : 8);
  const spreadAngle = getSpreadAngle(sorted.length);
  const center = (sorted.length - 1) / 2;
  const contentWidth = Math.max(
    containerWidth,
    layout.baseWidth + layout.padX * 2 + (boundaryOffsets[boundaryOffsets.length - 1] ?? 0) + NEAR_EXPAND * 2,
  );

  if (!me) return null;

  return (
    <div data-player-id={me.id} className="relative z-actions overflow-visible pt-8 -mt-8 pointer-events-none">
      {pendingColorCardId && (
        <ColorPicker
          onPick={(color) => {
            onPlayCard(pendingColorCardId, color);
            setPendingColorCardId(null);
          }}
        />
      )}
      <div
        ref={handViewportRef}
        className={
          isMobile
            ? `relative px-0 pt-2 pb-hand-pb overflow-x-auto overflow-y-hidden scrollbar-hidden pointer-events-auto touch-none ${isDraggingHand ? 'cursor-grabbing' : 'cursor-default'}`
            : 'relative px-0 overflow-visible pointer-events-auto touch-none'
        }
        style={{ height: handHeight }}
        onPointerDown={handleHandPointerDown}
        onPointerMove={handleHandPointerMove}
        onPointerUp={handleHandPointerEnd}
        onPointerCancel={handleHandPointerCancel}
        onPointerLeave={() => {
          if (!handDragRef.current.active) setActiveIndex(null);
        }}
        onClickCapture={handleHandClickCapture}
        onClick={playSelectedCard}
      >
        <div
          className="relative overflow-visible pointer-events-none"
          style={{ width: contentWidth, height: handHeight }}
        >
          <AnimatePresence mode="popLayout">
            {sorted.map((card, i) => {
              const isPlayable = playableIds.has(card.id);
              const isDimmed = isMyTurn && phase === 'playing' && !hintedIds.has(card.id);
              const isActive = activeIndex === i;
              const distance = activeIndex === null ? Number.POSITIVE_INFINITY : Math.abs(i - activeIndex);
              const side = activeIndex === null ? 0 : Math.sign(i - activeIndex);
              const localExpand =
                activeIndex === null
                  ? 0
                  : side * (
                    distance === 1 ? NEAR_EXPAND :
                      distance === 2 ? NEAR_EXPAND * 0.45 :
                        distance === 0 ? 0 : 0
                  );
              const boundaryOffset = boundaryOffsets[i] ?? 0;
              const x = layout.padX + i * layout.stride + boundaryOffset + localExpand;
              const angle = isActive ? 0 : (i - center) * (isMobile ? Math.min(spreadAngle, 1.2) : spreadAngle) * Math.min(1, layout.stride / 36);
              const y = isActive ? 0 : (isPlayable ? activeLift - 10 : activeLift);

              return (
                <AnimatedCard
                  key={card.id}
                  card={card}
                  playable={hintedIds.has(card.id)}
                  clickable={false}
                  dimmed={isDimmed}
                  className={`absolute left-0 ${isMobile ? 'top-2' : 'top-0'} pointer-events-none`}
                  cardClassName="!transition-none pointer-events-none"
                  forceCornerLabel
                  disableHoverLift
                  animate={{
                    x,
                    y,
                    rotate: angle,
                    scale: isActive ? ACTIVE_SCALE : 1,
                    opacity: hiddenHandCardIds.has(card.id) ? 0 : 1,
                    zIndex: isActive ? 300 : isPlayable ? 120 + i : i,
                  }}
                  transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.8 }}
                  style={{
                    width: layout.cardWidth,
                    height: layout.cardHeight,
                    transformOrigin: 'bottom center',
                  }}
                />
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

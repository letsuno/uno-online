import { useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { Card as CardType, Color } from '@uno-online/shared';
import { sortHand } from '@uno-online/shared';
import AnimatedCard from './AnimatedCard';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useIsMyTurn } from '../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../hooks/usePlayableCardIds';
import ColorPicker from './ColorPicker';

interface PlayerHandProps {
  onPlayCard: (cardId: string, chosenColor?: Color) => void;
}

function getSpreadAngle(count: number): number {
  if (count <= 5) return 6;
  if (count <= 10) return 4;
  return 3;
}

function isColorBoundary(sorted: CardType[], index: number): boolean {
  if (index === 0) return false;
  const prev = sorted[index - 1]!;
  const curr = sorted[index]!;
  const prevIsWild = prev.type === 'wild' || prev.type === 'wild_draw_four';
  const currIsWild = curr.type === 'wild' || curr.type === 'wild_draw_four';
  if (prevIsWild !== currIsWild) return true;
  if (!prevIsWild && !currIsWild && prev.color !== curr.color) return true;
  return false;
}

export default function PlayerHand({ onPlayCard }: PlayerHandProps) {
  const handScrollRef = useRef<HTMLDivElement>(null);
  const handDragRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    scrollLeft: 0,
    hasDragged: false,
    suppressClick: false,
  });
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

  if (!me) return null;

  const topCard = discardPile[discardPile.length - 1];
  const houseRules = settings?.houseRules;
  const shouldPickColorBeforePlay = (card: CardType) => {
    if (card.type !== 'wild_draw_four' || !houseRules || !topCard) return false;
    if (topCard.type !== 'draw_two' && topCard.type !== 'wild_draw_four') {
      return houseRules.stackDrawFour || houseRules.crossStack;
    }
    return (
      drawStack > 0 ||
      (drawStack === 0 && (houseRules.stackDrawFour || houseRules.crossStack))
    );
  };

  const spreadAngle = getSpreadAngle(sorted.length);
  const center = (sorted.length - 1) / 2;
  const [isDraggingHand, setIsDraggingHand] = useState(false);

  const handleHandPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const scrollEl = handScrollRef.current;
    if (!scrollEl) return;

    handDragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: scrollEl.scrollLeft,
      hasDragged: false,
      suppressClick: false,
    };
    scrollEl.setPointerCapture(event.pointerId);
  };

  const handleHandPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = handDragRef.current;
    const scrollEl = handScrollRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId || !scrollEl) return;

    const deltaX = event.clientX - drag.startX;
    if (Math.abs(deltaX) > 3) {
      drag.hasDragged = true;
      drag.suppressClick = true;
      setIsDraggingHand(true);
    }
    if (!drag.hasDragged) return;

    event.preventDefault();
    scrollEl.scrollLeft = drag.scrollLeft - deltaX;
  };

  const handleHandPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = handDragRef.current;
    const scrollEl = handScrollRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    drag.active = false;
    setIsDraggingHand(false);
    if (scrollEl?.hasPointerCapture(event.pointerId)) {
      scrollEl.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => {
      handDragRef.current.suppressClick = false;
    }, 0);
  };

  const handleHandPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = handDragRef.current;
    const scrollEl = handScrollRef.current;
    if (drag.pointerId === event.pointerId) {
      drag.active = false;
      drag.suppressClick = false;
      setIsDraggingHand(false);
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

  return (
    <div className="relative z-actions overflow-visible pt-10 -mt-10 pointer-events-none">
      {pendingColorCardId && (
        <ColorPicker
          onPick={(color) => {
            onPlayCard(pendingColorCardId, color);
            setPendingColorCardId(null);
          }}
        />
      )}
      <div
        ref={handScrollRef}
        className={`relative rounded-t-2xl px-5 pt-8 pb-hand-pb flex justify-start overflow-x-auto overflow-y-visible scrollbar-hidden pointer-events-auto touch-pan-x ${
          isDraggingHand ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={handleHandPointerDown}
        onPointerMove={handleHandPointerMove}
        onPointerUp={handleHandPointerEnd}
        onPointerCancel={handleHandPointerCancel}
        onClickCapture={handleHandClickCapture}
      >
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xs text-muted-foreground whitespace-nowrap">
          我的手牌 · {sorted.length}张
        </span>
        <div className="flex min-w-full w-max justify-center items-end overflow-visible">
          <AnimatePresence mode="popLayout">
            {sorted.map((card, i) => {
              const angle = (i - center) * spreadAngle;
              const isPlayable = playableIds.has(card.id);
              const isDimmed = isMyTurn && phase === 'playing' && !hintedIds.has(card.id);
              const boundary = isColorBoundary(sorted, i);
              return (
                <AnimatedCard
                  key={card.id}
                  layoutId={card.id}
                  card={card}
                  playable={hintedIds.has(card.id)}
                  clickable={isPlayable}
                  dimmed={isDimmed}
                  onClick={() => {
                    if (!isPlayable) return;
                    if (shouldPickColorBeforePlay(card)) {
                      setPendingColorCardId(card.id);
                      return;
                    }
                    onPlayCard(card.id);
                  }}
                  className="snap-center"
                  style={{
                    transform: `rotate(${angle}deg)`,
                    transformOrigin: 'bottom center',
                    marginLeft: boundary ? 12 : 4,
                    marginBottom: isPlayable ? 10 : 0,
                    zIndex: isPlayable ? 100 + i : i,
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

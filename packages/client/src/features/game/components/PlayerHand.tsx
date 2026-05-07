import { useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { Card as CardType } from '@uno-online/shared';
import { sortHand } from '@uno-online/shared';
import AnimatedCard from './AnimatedCard';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useIsMyTurn } from '../hooks/useIsMyTurn';
import { usePlayableCardIds } from '../hooks/usePlayableCardIds';

interface PlayerHandProps {
  onPlayCard: (cardId: string) => void;
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
  const userId = useEffectiveUserId();
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const settings = useGameStore((s) => s.settings);

  const me = players.find((p) => p.id === userId);
  const isMyTurn = useIsMyTurn();

  const playableIds = usePlayableCardIds();
  const hintedIds = settings?.houseRules?.noHints ? new Set<string>() : playableIds;

  const sorted = useMemo(() => sortHand(me?.hand ?? []), [me?.hand]);

  if (!me) return null;

  const spreadAngle = getSpreadAngle(sorted.length);
  const center = (sorted.length - 1) / 2;

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-px bg-primary/15" />
      <div
        className="relative rounded-t-2xl px-5 pt-8 pb-hand-pb flex justify-center overflow-x-auto overflow-y-visible scrollbar-hidden"
        style={{
          background: 'radial-gradient(ellipse at 50% 100%, rgba(251,191,36,0.08) 0%, rgba(0,0,0,0.35) 60%)',
        }}
      >
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xs text-muted-foreground whitespace-nowrap">
          我的手牌 · {sorted.length}张
        </span>
        <div className="flex justify-center items-end">
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
                  onClick={() => isPlayable && onPlayCard(card.id)}
                  className="snap-center"
                  style={{
                    transform: `rotate(${angle}deg)`,
                    transformOrigin: 'bottom center',
                    marginLeft: boundary ? 12 : 4,
                    marginBottom: isPlayable ? 10 : 0,
                    zIndex: i,
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

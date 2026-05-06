import { useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { Card as CardType } from '@uno-online/shared';
import AnimatedCard from './AnimatedCard';
import { useGameStore } from '../stores/game-store';
import { useAuthStore } from '../stores/auth-store';
import { getPlayableCardIds } from '../utils/playable-cards';

interface PlayerHandProps {
  onPlayCard: (cardId: string) => void;
}

const COLOR_ORDER: Record<string, number> = { red: 0, blue: 1, green: 2, yellow: 3 };
const TYPE_ORDER: Record<string, number> = { number: 0, skip: 1, reverse: 2, draw_two: 3, wild: 0, wild_draw_four: 1 };

function sortCards(cards: CardType[]): CardType[] {
  return [...cards].sort((a, b) => {
    const aIsWild = a.type === 'wild' || a.type === 'wild_draw_four';
    const bIsWild = b.type === 'wild' || b.type === 'wild_draw_four';
    if (aIsWild !== bIsWild) return aIsWild ? 1 : -1;
    if (aIsWild && bIsWild) return (TYPE_ORDER[a.type] ?? 0) - (TYPE_ORDER[b.type] ?? 0);
    const colorDiff = (COLOR_ORDER[a.color!] ?? 99) - (COLOR_ORDER[b.color!] ?? 99);
    if (colorDiff !== 0) return colorDiff;
    const typeDiff = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    if (typeDiff !== 0) return typeDiff;
    if (a.type === 'number' && b.type === 'number') return (a.value ?? 0) - (b.value ?? 0);
    return 0;
  });
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
  const authUserId = useAuthStore((s) => s.user?.id);
  const viewerId = useGameStore((s) => s.viewerId);
  const userId = viewerId ?? authUserId;
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const discardPile = useGameStore((s) => s.discardPile);
  const currentColor = useGameStore((s) => s.currentColor);
  const phase = useGameStore((s) => s.phase);
  const settings = useGameStore((s) => s.settings);
  const drawStack = useGameStore((s) => s.drawStack);

  const me = players.find((p) => p.id === userId);
  const isMyTurn = players[currentPlayerIndex]?.id === userId;
  const topCard = discardPile[discardPile.length - 1];

  const playableIds = useMemo(() => {
    if (!isMyTurn || phase !== 'playing') return new Set<string>();
    return getPlayableCardIds({
      hand: me?.hand ?? [],
      topCard,
      currentColor,
      drawStack,
      houseRules: settings?.houseRules,
    });
  }, [currentColor, drawStack, isMyTurn, me?.hand, phase, settings?.houseRules, topCard]);
  const hintedIds = settings?.houseRules?.noHints ? new Set<string>() : playableIds;

  const sorted = useMemo(() => sortCards(me?.hand ?? []), [me?.hand]);

  if (!me) return null;

  const spreadAngle = getSpreadAngle(sorted.length);
  const center = (sorted.length - 1) / 2;

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-px bg-primary/15" />
      <div
        className="relative rounded-t-2xl px-5 pt-5 pb-hand-pb flex justify-center overflow-x-auto scrollbar-hidden"
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
              const boundary = isColorBoundary(sorted, i);
              return (
                <AnimatedCard
                  key={card.id}
                  layoutId={card.id}
                  card={card}
                  playable={hintedIds.has(card.id)}
                  clickable={isPlayable}
                  onClick={() => isPlayable && onPlayCard(card.id)}
                  className="-mr-2.5 last:mr-0 snap-center"
                  style={{
                    transform: `rotate(${angle}deg)`,
                    transformOrigin: 'bottom center',
                    marginLeft: boundary ? 8 : undefined,
                    marginBottom: isPlayable ? 10 : 0,
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

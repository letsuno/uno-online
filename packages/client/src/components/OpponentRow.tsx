import { useState, useEffect } from 'react';
import CardBack from './CardBack';
import Card from './Card';
import { useGameStore } from '../stores/game-store';
import { useAuthStore } from '../stores/auth-store';
import { cn } from '@/lib/utils';

const AVATAR_COLORS = ['#ff3366', '#33cc66', '#4488ff', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#6366f1'];
const AVATAR_EMOJIS = ['😎', '🤠', '😺', '🐸', '🦊', '🐱', '🐶', '🦁', '🐼'];

export default function OpponentRow() {
  const authUserId = useAuthStore((s) => s.user?.id);
  const viewerId = useGameStore((s) => s.viewerId);
  const userId = viewerId ?? authUserId;
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const [shakenId, setShakenId] = useState<string | null>(null);

  // Detect when an opponent's hand suddenly grows (caught UNO penalty)
  const prevCounts = useState<Record<string, number>>(() => ({}))[0];
  useEffect(() => {
    for (const p of players) {
      const prev = prevCounts[p.id];
      if (prev !== undefined && p.handCount > prev + 1 && p.id !== userId) {
        setShakenId(p.id);
        setTimeout(() => setShakenId(null), 600);
      }
      prevCounts[p.id] = p.handCount;
    }
  }, [players]);

  const me = players.find((p) => p.id === userId);
  const opponents = userId ? players.filter((p) => p.id !== userId) : [];

  return (
    <div className="flex justify-center gap-2 md:gap-3 px-2.5 md:px-5 py-1.5 md:py-2.5 flex-wrap">
      {opponents.map((opp, i) => {
        const isActive = players[currentPlayerIndex]?.id === opp.id;
        const isTeammate = me?.teamId !== undefined && opp.teamId === me.teamId;
        return (
          <div
            key={opp.id}
            className="flex flex-col items-center gap-[3px]"
            style={{
              ...(opp.eliminated ? { opacity: 0.35, filter: 'grayscale(0.8)' } : {}),
              ...(shakenId === opp.id ? { animation: 'shake 0.1s ease-in-out 3' } : {}),
            }}
          >
            <div
              className={cn(
                'w-9 h-9 md:w-11 md:h-11 rounded-full flex items-center justify-center',
                'text-sm md:text-lg',
                'border-2 border-white/30',
                'transition-[border,box-shadow] duration-300 ease-in-out',
                isActive && 'border-3 border-primary shadow-[0_0_12px_rgba(251,191,36,0.6)]',
                isTeammate && 'border-2 border-accent',
              )}
              style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
            >
              {AVATAR_EMOJIS[i % AVATAR_EMOJIS.length]}
            </div>
            <span
              className={cn(
                'text-[11px] text-foreground transition-colors duration-300 ease-in-out',
                isActive && 'text-primary font-bold',
              )}
            >
              {isTeammate ? '🤝 ' : ''}{opp.name} {isActive ? '◀' : ''} {opp.eliminated ? '❌' : ''}
            </span>
            <div className="flex gap-px">
              {opp.hand.length > 0
                ? opp.hand.map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      className="!w-7 !h-10 !text-[10px] !border-2 !rounded-md"
                    />
                  ))
                : Array.from({ length: Math.min(opp.handCount, 10) }).map((_, j) => (
                    <CardBack key={j} small />
                  ))
              }
            </div>
            <span className="text-[10px] text-muted-foreground">{opp.handCount}张</span>
            {!opp.connected && <span className="text-[10px] text-destructive">掉线</span>}
          </div>
        );
      })}
    </div>
  );
}

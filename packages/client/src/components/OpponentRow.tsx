import { useState, useEffect } from 'react';
import CardBack from './CardBack';
import Card from './Card';
import { useGameStore } from '../stores/game-store';
import { useAuthStore } from '../stores/auth-store';
import { cn, getRoleColor } from '@/lib/utils';
import GoogleRing from './ui/GoogleRing';

const AVATAR_COLORS = ['#ff3366', '#33cc66', '#4488ff', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#6366f1'];

function getAvatarUrl(player: { id: string; name: string; avatarUrl?: string | null }): string {
  if (player.avatarUrl) return player.avatarUrl;
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(player.id)}`;
}

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
            className="flex flex-col items-center gap-opponent-gap"
            style={{
              ...(opp.eliminated ? { opacity: 0.35, filter: 'grayscale(0.8)' } : {}),
              ...(shakenId === opp.id ? { animation: 'shake 0.1s ease-in-out 3' } : {}),
            }}
          >
            <div
              className={cn(
                'relative w-9 h-9 md:w-11 md:h-11 rounded-full flex items-center justify-center',
                'text-sm md:text-lg',
                'transition-[box-shadow] duration-300 ease-in-out',
                isActive && 'shadow-glow-active',
              )}
              style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
            >
              <img src={getAvatarUrl(opp)} alt={opp.name} style={{ width: '85%', height: '85%', borderRadius: '50%', objectFit: 'cover' }} />
              <GoogleRing size={0} className="w-full h-full" />
            </div>
            <span
              className={cn(
                'text-sm text-foreground transition-colors duration-300 ease-in-out',
                isActive && 'text-primary font-bold',
              )}
              style={(!isActive && getRoleColor(opp.role))
                ? { color: getRoleColor(opp.role) }
                : undefined}
            >
              {isTeammate ? '🤝 ' : ''}{opp.name} {isActive ? '◀' : ''} {opp.eliminated ? '❌' : ''}
            </span>
            <div className="flex gap-px">
              {opp.hand.length > 0
                ? opp.hand.map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      className="!w-7 !h-10 !text-xs !border-2 !rounded-md"
                    />
                  ))
                : Array.from({ length: Math.min(opp.handCount, 10) }).map((_, j) => (
                    <CardBack key={j} small />
                  ))
              }
            </div>
            <span className="text-xs text-muted-foreground">{opp.handCount}张</span>
            {!opp.connected && <span className="text-xs text-destructive">掉线</span>}
          </div>
        );
      })}
    </div>
  );
}

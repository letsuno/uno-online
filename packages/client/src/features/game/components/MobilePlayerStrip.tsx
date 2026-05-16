import { Fragment } from 'react';
import { Bot, ChevronRight, ChevronLeft } from 'lucide-react';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useRoomStore } from '@/shared/stores/room-store';
import { cn } from '@/shared/lib/utils';

const AVATAR_COLORS = [
  'var(--color-avatar-1)', 'var(--color-avatar-2)', 'var(--color-avatar-3)',
  'var(--color-avatar-4)', 'var(--color-avatar-5)', 'var(--color-avatar-6)',
  'var(--color-avatar-7)', 'var(--color-avatar-8)', 'var(--color-avatar-9)',
];

export default function MobilePlayerStrip() {
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const direction = useGameStore((s) => s.direction);
  const phase = useGameStore((s) => s.phase);
  const userId = useEffectiveUserId();
  const ownerId = useRoomStore((s) => s.room?.ownerId);

  if (phase === 'round_end' || phase === 'game_over') return null;

  const Arrow = direction === 'clockwise' ? ChevronRight : ChevronLeft;

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 overflow-x-auto scrollbar-hidden">
      {players.map((player, i) => {
        const isCurrent = i === currentPlayerIndex;
        const isMe = player.id === userId;
        const isHost = player.id === ownerId;

        return (
          <Fragment key={player.id}>
            {i > 0 && (
              <Arrow size={10} className="text-muted-foreground/30 shrink-0 mx-px" />
            )}
            <div
              className={cn(
                'flex items-center gap-1 rounded-full pl-1 pr-2 py-0.5 shrink-0 text-xs transition-colors',
                isCurrent && 'bg-primary/20 ring-1 ring-primary/40',
                isMe && !isCurrent && 'bg-white/8',
              )}
            >
              <div className="relative shrink-0">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
                  style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                >
                  {player.avatarUrl
                    ? <img src={player.avatarUrl} className="w-full h-full object-cover" alt="" />
                    : player.name[0]?.toUpperCase()
                  }
                </div>
                {isHost && (
                  <span className="absolute -top-1 -right-1 text-[8px] leading-none">👑</span>
                )}
              </div>
              <span className={cn(
                'max-w-12 truncate font-game leading-none',
                isCurrent ? 'text-primary' : isMe ? 'text-foreground' : 'text-muted-foreground',
              )}>
                {player.name}
              </span>
              <span className="text-muted-foreground/50 tabular-nums">{player.handCount}</span>
              {(player.score > 0 || (player.roundWins ?? 0) > 0) && (
                <span className="text-[9px] text-accent/70 tabular-nums">
                  {player.score > 0 && `${player.score}分`}
                  {(player.roundWins ?? 0) > 0 && `🏆${player.roundWins}`}
                </span>
              )}
              {player.calledUno && (
                <span className="text-[8px] text-primary font-black leading-none">UNO</span>
              )}
              {player.autopilot && <Bot size={9} className="text-uno-blue" />}
              {!player.connected && (
                <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

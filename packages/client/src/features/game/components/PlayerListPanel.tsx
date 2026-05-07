import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { AVATAR_COLORS, AVATAR_EMOJIS } from './PlayerNode';
import GoogleRing from '@/shared/components/ui/GoogleRing';
import { cn, getRoleColor } from '@/shared/lib/utils';

export default function PlayerListPanel() {
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const userId = useEffectiveUserId();

  if (players.length === 0) return null;

  return (
    <div className="absolute top-12 right-3 z-topbar hidden md:block">
      <div className="rounded-card-ui bg-card/80 backdrop-blur-sm shadow-card shadow-tech border border-white/10 w-48 max-h-64 overflow-y-auto scrollbar-thin">
        <div className="px-3 py-2 border-b border-white/10 text-xs text-muted-foreground font-bold">
          玩家 ({players.length})
        </div>
        <div className="py-1">
          {players.map((p, i) => {
            const isActive = i === currentPlayerIndex;
            const isMe = p.id === userId;
            return (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 transition-colors',
                  isActive && 'bg-primary/10',
                  p.eliminated && 'opacity-40',
                )}
              >
                <div
                  className="relative w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0"
                  style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                >
                  {AVATAR_EMOJIS[i % AVATAR_EMOJIS.length]}
                  <GoogleRing size={0} className="w-full h-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    'text-xs truncate',
                    isActive && 'text-primary font-bold',
                    isMe && !isActive && 'text-primary',
                    !isActive && !isMe && 'text-foreground',
                  )} style={(!isActive && !isMe && getRoleColor(p.role)) ? { color: getRoleColor(p.role) } : undefined}>
                    {p.name}{isMe ? ' (你)' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-2xs text-muted-foreground">{p.handCount}</span>
                  {!p.connected && <span className="w-1.5 h-1.5 rounded-full bg-destructive" />}
                  {isActive && <span className="text-2xs">◀</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

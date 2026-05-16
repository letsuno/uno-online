import { Eye } from 'lucide-react';
import type { RoomSpectator } from '@uno-online/shared';
import { cn } from '@/shared/lib/utils';
import { getRoleColor } from '@/shared/lib/utils';

interface SpectatorBarProps {
  spectators: RoomSpectator[];
  compact?: boolean;
}

export default function SpectatorBar({ spectators, compact = false }: SpectatorBarProps) {
  if (spectators.length === 0) return null;

  return (
    <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2">
      <Eye size={13} className="text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground shrink-0">{spectators.length}</span>

      <div className="flex items-center gap-1.5 flex-wrap">
        {spectators.map((spectator) => {
          const roleColor = getRoleColor(spectator.role);
          return (
            <div
              key={spectator.userId}
              className={cn(
                'flex items-center gap-1',
                compact && 'gap-0',
              )}
              title={spectator.nickname}
            >
              {/* Avatar */}
              <div className="w-6 h-6 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xs shrink-0 overflow-hidden">
                {spectator.avatarUrl ? (
                  <img
                    src={spectator.avatarUrl}
                    alt={spectator.nickname}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <span className="text-muted-foreground text-[10px]">
                    {spectator.nickname.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Name — hidden in compact mode */}
              {!compact && (
                <span
                  className="text-xs text-muted-foreground leading-none"
                  style={roleColor ? { color: roleColor } : undefined}
                >
                  {spectator.nickname.length > 8
                    ? spectator.nickname.slice(0, 8) + '…'
                    : spectator.nickname}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

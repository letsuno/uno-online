import { Eye, UserX } from 'lucide-react';
import type { RoomSpectator } from '@uno-online/shared';
import { cn } from '@/shared/lib/utils';
import { getRoleColor } from '@/shared/lib/utils';
import { getSocket } from '@/shared/socket';
import { showConfirm } from '@/shared/stores/confirm-store';
import { useToastStore } from '@/shared/stores/toast-store';

interface SpectatorBarProps {
  spectators: RoomSpectator[];
  isOwner?: boolean;
  currentUserId?: string;
}

export default function SpectatorBar({ spectators, isOwner = false, currentUserId }: SpectatorBarProps) {
  if (spectators.length === 0) return null;

  const kickSpectator = async (spectator: RoomSpectator) => {
    if (
      !(await showConfirm({
        title: '踢出观战者',
        message: `确定要将 ${spectator.nickname} 踢出房间吗？`,
        confirmText: '踢出',
        variant: 'danger',
      }))
    )
      return;

    getSocket().emit('room:kick', { targetId: spectator.userId }, res => {
      if (!res.success) {
        useToastStore.getState().addToast(res.error, 'error');
      }
    });
  };

  return (
    <div className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2">
      <Eye size={13} className="text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground shrink-0">{spectators.length}</span>

      <div className="flex items-center gap-1.5 flex-wrap">
        {spectators.map(spectator => {
          const roleColor = getRoleColor(spectator.role);
          const canKick = isOwner && spectator.userId !== currentUserId;
          return (
            <div
              key={spectator.userId}
              className="flex items-center gap-1"
              title={spectator.nickname + (!spectator.connected ? ' (已断线)' : '')}
            >
              <div className={cn('flex items-center gap-1', !spectator.connected && 'opacity-40')}>
                {/* Avatar */}
                <div className="w-6 h-6 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xs shrink-0 overflow-hidden">
                  {spectator.avatarUrl ? (
                    <img
                      src={spectator.avatarUrl}
                      alt={spectator.nickname}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={e => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="text-muted-foreground text-[10px]">
                      {spectator.nickname.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                <span
                  className="text-xs text-muted-foreground leading-none"
                  style={roleColor ? { color: roleColor } : undefined}
                >
                  {spectator.nickname.length > 8 ? spectator.nickname.slice(0, 8) + '…' : spectator.nickname}
                </span>
              </div>
              {canKick && (
                <button
                  type="button"
                  onClick={() => void kickSpectator(spectator)}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                  title={`踢出 ${spectator.nickname}`}
                  aria-label={`踢出 ${spectator.nickname}`}
                >
                  <UserX size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

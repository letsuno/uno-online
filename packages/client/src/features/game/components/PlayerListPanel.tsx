import { Bot, Crown, Eye, UserPlus } from 'lucide-react';
import { useGameStore } from '../stores/game-store';
import { useSpectatorStore } from '../stores/spectator-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants/avatars';
import { DIFFICULTY_DISPLAY } from '../constants/bot-difficulty';
import GoogleRing from '@/shared/components/ui/GoogleRing';
import PlayerVoiceStatus from '@/shared/voice/PlayerVoiceStatus';
import { cn, getRoleColor } from '@/shared/lib/utils';
import { AiBadge } from '@/shared/components/ui/AiBadge';

export default function PlayerListPanel() {
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const spectators = useSpectatorStore((s) => s.spectators);
  const pendingJoinQueue = useSpectatorStore((s) => s.pendingJoinQueue);
  const ownerId = useRoomStore((s) => s.room?.ownerId);
  const userId = useEffectiveUserId();

  if (players.length === 0) return null;

  return (
    <div className="absolute top-12 right-3 z-topbar hidden md:block">
      <div className="rounded-card-ui bg-card/80 backdrop-blur-sm shadow-card shadow-tech border border-white/10 w-48 max-h-64 overflow-y-auto scrollbar-thin">
        <div className="px-3 py-2 border-b border-white/10 text-xs text-muted-foreground font-bold">
          玩家 ({players.length})
        </div>
        <div className="py-1">
          {players.map((p, i: number) => {
            const isActive = i === currentPlayerIndex;
            const isMe = p.id === userId;
            const roleColor = getRoleColor(p.role);
            return (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 transition-colors',
                  isActive && 'bg-primary/10',
                  p.eliminated && 'opacity-40',
                )}
              >
                {(() => {
                  const isConfiguredBot = p.isBot && !!p.botConfig;
                  const botDisplay = isConfiguredBot ? DIFFICULTY_DISPLAY[p.botConfig!.difficulty] : undefined;
                  return (
                    <div
                      className="relative w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 overflow-hidden"
                      style={{
                        background: botDisplay
                          ? botDisplay.avatarBg
                          : AVATAR_COLORS[i % AVATAR_COLORS.length],
                      }}
                    >
                      {isConfiguredBot ? (
                        <Bot size={13} className="text-white drop-shadow-sm" />
                      ) : (
                        <>
                          <span>{AVATAR_EMOJIS[i % AVATAR_EMOJIS.length]}</span>
                          {p.avatarUrl && (
                            <img
                              src={p.avatarUrl}
                              alt={p.name}
                              className="absolute inset-0 w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                        </>
                      )}
                      {botDisplay ? (
                        <div
                          className="absolute inset-0 rounded-full pointer-events-none"
                          style={{
                            border: `1.5px solid ${botDisplay.ringColor}`,
                          }}
                        />
                      ) : (
                        <GoogleRing size={0} className="w-full h-full" />
                      )}
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    'text-xs truncate',
                    isActive && 'text-primary font-bold',
                    isMe && !isActive && 'text-primary',
                    !isActive && !isMe && 'text-foreground',
                  )} style={(!isActive && !isMe && roleColor) ? { color: roleColor } : undefined}>
                    {p.name}{isMe ? ' (你)' : ''}{p.id === ownerId && <Crown size={10} className="inline align-middle ml-1 text-yellow-500" />}{p.isBot && <AiBadge className="ml-1" />}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <PlayerVoiceStatus playerId={p.id} playerName={p.name} isSelf={isMe} />
                  <span className="text-2xs text-muted-foreground">{p.handCount}</span>
                  {!p.connected && <span className="w-1.5 h-1.5 rounded-full bg-destructive" />}
                  {isActive && <span className="text-2xs">◀</span>}
                </div>
              </div>
            );
          })}
        </div>
        {spectators.length > 0 && (
          <>
            <div className="px-3 py-2 border-t border-white/10 text-xs text-muted-foreground font-bold">
              观众 ({spectators.length})
            </div>
            <div className="py-1">
              {spectators.map((s) => {
                const queued = pendingJoinQueue.includes(s.nickname);
                return (
                  <div key={s.nickname} className={cn('flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground', !s.connected && 'opacity-50')}>
                    {queued ? <UserPlus size={12} className="shrink-0 text-accent" /> : <Eye size={12} className="shrink-0" />}
                    <span className={cn('truncate', queued && 'text-accent')}>{s.nickname}</span>
                    {!s.connected && <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0 ml-auto" />}
                    {queued && <span className="text-2xs text-accent ml-auto shrink-0">加入中</span>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

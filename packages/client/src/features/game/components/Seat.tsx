import { Crown, WifiOff, Plus, Check } from 'lucide-react';
import type { RoomSeatPlayer } from '@uno-online/shared';
import { cn, getRoleColor } from '@/shared/lib/utils';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants/avatars';
import { DIFFICULTY_DISPLAY } from '../constants/bot-difficulty';
import PlayerVoiceStatus from '@/shared/voice/PlayerVoiceStatus';

interface SeatProps {
  index: number;
  player: RoomSeatPlayer | null;
  isMe: boolean;
  isOwnerSeat: boolean;
  compact?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export default function Seat({ index, player, isMe, isOwnerSeat, compact = false, onClick }: SeatProps) {
  const avatarSize = compact ? 36 : 48;
  const seatLabel = index + 1;

  if (!player) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex flex-col items-center gap-1 group cursor-pointer"
        title={`座位 ${seatLabel}`}
      >
        <div
          className="rounded-full border-2 border-dashed border-white/25 flex items-center justify-center relative transition-colors group-hover:border-white/50 group-hover:bg-white/5"
          style={{ width: avatarSize, height: avatarSize }}
        >
          <Plus size={compact ? 14 : 18} className="text-white/30 group-hover:text-white/60 transition-colors" />
        </div>
        <span className="text-xs text-muted-foreground/50">{seatLabel}</span>
      </button>
    );
  }

  const roleColor = getRoleColor(player.role);
  const isBot = player.isBot;
  const botDiff = isBot && player.botConfig ? DIFFICULTY_DISPLAY[player.botConfig.difficulty] : undefined;
  const displayName = player.nickname.length > 7 ? player.nickname.slice(0, 7) + '…' : player.nickname;

  return (
    <div
      className={cn('flex flex-col items-center gap-1 select-none', !player.connected && 'opacity-50')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {/* Avatar */}
      <div className="relative" style={{ width: avatarSize, height: avatarSize }}>
        {/* Avatar circle */}
        <div
          className={cn(
            'rounded-full flex items-center justify-center overflow-hidden w-full h-full text-base',
            isMe && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
          )}
          style={
            botDiff
              ? { background: botDiff.avatarBg }
              : { background: AVATAR_COLORS[index % AVATAR_COLORS.length] }
          }
        >
          {isBot ? (
            <span className="text-white" style={{ fontSize: compact ? 14 : 20 }}>🤖</span>
          ) : (
            <>
              <span style={{ fontSize: compact ? 14 : 20 }}>
                {AVATAR_EMOJIS[index % AVATAR_EMOJIS.length]}
              </span>
              {player.avatarUrl && (
                <img
                  src={player.avatarUrl}
                  alt={player.nickname}
                  className="absolute inset-0 w-full h-full object-cover rounded-full"
                  referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
            </>
          )}
        </div>

        {/* Bot difficulty ring */}
        {botDiff && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ border: `2px solid ${botDiff.ringColor}`, boxShadow: `0 0 6px ${botDiff.ringColor}40` }}
          />
        )}

        {/* Owner crown */}
        {isOwnerSeat && (
          <Crown
            size={compact ? 10 : 13}
            className="absolute -top-1.5 -left-1 text-yellow-400 drop-shadow fill-yellow-400"
          />
        )}

        {/* Disconnect overlay icon */}
        {!player.connected && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
            <WifiOff size={compact ? 12 : 16} className="text-destructive" />
          </div>
        )}

        {/* Ready indicator dot */}
        {player.ready && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
            <Check size={9} className="text-white" strokeWidth={3} />
          </div>
        )}
      </div>

      {/* Name row */}
      <div className="flex items-center gap-0.5 max-w-[64px]">
        <span
          className={cn('text-xs truncate leading-none', isMe && 'text-primary font-semibold')}
          style={!isMe && roleColor ? { color: roleColor } : undefined}
        >
          {displayName}
        </span>
        {!isBot && player.connected && (
          <PlayerVoiceStatus
            playerId={player.userId}
            playerName={player.nickname}
            isSelf={isMe}
          />
        )}
      </div>

      {/* Bot difficulty badge */}
      {botDiff && (
        <span
          className="text-[9px] font-bold leading-none rounded px-1 py-0.5"
          style={{ color: botDiff.ringColor, backgroundColor: `${botDiff.avatarBg}25` }}
        >
          AI · {botDiff.label}
        </span>
      )}

      {/* Ready / not ready label for non-bot players */}
      {!isBot && (
        <span className={cn('text-[9px] leading-none', player.ready ? 'text-green-400' : 'text-muted-foreground/50')}>
          {player.ready ? '已准备' : '未准备'}
        </span>
      )}
    </div>
  );
}

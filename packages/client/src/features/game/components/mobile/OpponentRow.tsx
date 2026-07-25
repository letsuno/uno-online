import { Fragment } from 'react';
import { Bot, ChevronRight, ChevronLeft, Crown, WifiOff } from 'lucide-react';
import { useGameStore } from '../../stores/game-store';
import { useEffectiveUserId } from '../../hooks/useEffectiveUserId';
import { useRoomStore } from '@/shared/stores/room-store';
import { cn } from '@/shared/lib/utils';

const AVATAR_COLORS = [
  'var(--color-avatar-1)', 'var(--color-avatar-2)', 'var(--color-avatar-3)',
  'var(--color-avatar-4)', 'var(--color-avatar-5)', 'var(--color-avatar-6)',
  'var(--color-avatar-7)', 'var(--color-avatar-8)', 'var(--color-avatar-9)',
];

interface OpponentRowProps {
  onSelect: (playerId: string, name: string) => void;
}

/**
 * 移动端对手栏：横向卡片列（头像 + 牌数 + 状态），当前回合金色光环。
 * 点击对手弹出互动面板（表情/投掷）。自己在手牌区，不在此列。
 */
export default function OpponentRow({ onSelect }: OpponentRowProps) {
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const direction = useGameStore((s) => s.direction);
  const phase = useGameStore((s) => s.phase);
  const userId = useEffectiveUserId();
  const ownerId = useRoomStore((s) => s.room?.ownerId);

  if (phase === 'round_end' || phase === 'game_over') return null;

  const opponents = players
    .map((p, i) => ({ player: p, index: i }))
    .filter(({ player }) => player.id !== userId);

  const Arrow = direction === 'clockwise' ? ChevronRight : ChevronLeft;

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-hidden shrink-0">
      {opponents.map(({ player, index }, order) => {
        const isCurrent = index === currentPlayerIndex;
        return (
          <Fragment key={player.id}>
            {order > 0 && <Arrow size={11} className="text-muted-foreground/30 shrink-0" />}
            <button
              onClick={() => onSelect(player.id, player.name)}
              className={cn(
                'relative flex flex-col items-center gap-1 w-[68px] shrink-0 py-1.5 rounded-2xl cursor-pointer transition-colors bg-transparent border-0',
                isCurrent ? 'bg-primary/10' : 'active:bg-white/5',
              )}
            >
              <div className="relative">
                <div
                  className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white overflow-hidden transition-shadow',
                    isCurrent && 'ring-2 ring-primary shadow-glow-active',
                  )}
                  style={{ background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}
                >
                  {player.isBot ? (
                    <Bot size={20} className="text-white/90" />
                  ) : player.avatarUrl ? (
                    <img src={player.avatarUrl} className="w-full h-full object-cover" alt="" />
                  ) : (
                    player.name[0]?.toUpperCase()
                  )}
                </div>
                {/* 牌数徽章 */}
                <span className="absolute -bottom-1 -right-1 min-w-6 h-6 px-1 rounded-full bg-popover border border-border text-xs font-bold text-foreground flex items-center justify-center tabular-nums">
                  {player.handCount}
                </span>
                {/* 房主 */}
                {player.id === ownerId && (
                  <Crown size={13} className="absolute -top-1.5 -left-1 text-primary fill-primary drop-shadow" />
                )}
                {/* 断线 */}
                {!player.connected && (
                  <div className="absolute inset-0 rounded-full bg-black/55 flex items-center justify-center">
                    <WifiOff size={16} className="text-destructive" />
                  </div>
                )}
              </div>
              <span
                className={cn(
                  'text-xs leading-none max-w-[64px] truncate font-game',
                  isCurrent ? 'text-primary font-bold' : 'text-muted-foreground',
                )}
              >
                {player.name}
              </span>
              <span className="flex items-center gap-1 h-3">
                {player.calledUno && <span className="text-[9px] text-primary font-black leading-none">UNO!</span>}
                {player.autopilot && <Bot size={10} className="text-uno-blue" />}
                {(player.score > 0 || (player.roundWins ?? 0) > 0) && (
                  <span className="text-[9px] text-accent/70 tabular-nums leading-none">
                    {player.score > 0 && `${player.score}分`}
                    {(player.roundWins ?? 0) > 0 && `🏆${player.roundWins}`}
                  </span>
                )}
              </span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

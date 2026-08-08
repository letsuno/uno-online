import { Crown, WifiOff } from 'lucide-react';
import { useGameStore } from '../../stores/game-store';
import { useSpectatorStore } from '../../stores/spectator-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { useEffectiveUserId } from '../../hooks/useEffectiveUserId';
import { cn } from '@/shared/lib/utils';
import { DIFFICULTY_DISPLAY } from '../../constants/bot-difficulty';
import { BotAvatarIcon } from '../BotAvatarIcon';

const AVATAR_COLORS = [
  'var(--color-avatar-1)', 'var(--color-avatar-2)', 'var(--color-avatar-3)',
  'var(--color-avatar-4)', 'var(--color-avatar-5)', 'var(--color-avatar-6)',
  'var(--color-avatar-7)', 'var(--color-avatar-8)', 'var(--color-avatar-9)',
];

/**
 * 玩家列表 Tab（InfoSheet）：玩家（头像/牌数/分数/状态）+ 观战（含下局排队状态）。
 * 与桌面 PlayerListPanel 同一数据源。
 */
export default function PlayerListTab() {
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const userId = useEffectiveUserId();
  const ownerId = useRoomStore((s) => s.room?.ownerId);
  const spectators = useSpectatorStore((s) => s.spectators);
  const pendingJoinQueue = useSpectatorStore((s) => s.pendingJoinQueue);

  return (
    <div className="flex flex-col gap-1">
      {players.map((p, i) => {
        const isCurrent = i === currentPlayerIndex;
        const isMe = p.id === userId;
        return (
          <div
            key={p.id}
            className={cn(
              'flex items-center gap-2.5 rounded-xl px-2.5 py-2',
              isCurrent && 'bg-primary/10',
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white overflow-hidden shrink-0 relative',
                isCurrent && 'ring-2 ring-primary',
              )}
              style={{
                background: p.isBot && p.botConfig
                  ? DIFFICULTY_DISPLAY[p.botConfig.difficulty].avatarBg
                  : AVATAR_COLORS[i % AVATAR_COLORS.length],
              }}
            >
              {p.isBot ? <BotAvatarIcon difficulty={p.botConfig?.difficulty} size={14} /> : p.avatarUrl
                ? <img src={p.avatarUrl} className="w-full h-full object-cover" alt="" />
                : p.name[0]?.toUpperCase()}
              {!p.connected && (
                <div className="absolute inset-0 rounded-full bg-black/55 flex items-center justify-center">
                  <WifiOff size={12} className="text-destructive" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn('text-sm truncate', isCurrent ? 'text-primary font-bold' : 'text-foreground')}>
                {p.name}
                {isMe && <span className="text-muted-foreground">（你）</span>}
                {p.id === ownerId && <Crown size={11} className="inline align-middle ml-1 text-primary" />}
                {p.isBot && <span className="ml-1 text-[10px] text-muted-foreground">AI</span>}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {p.score} 分{p.roundWins ? ` · 🏆${p.roundWins}` : ''}{p.calledUno ? ' · UNO!' : ''}{p.autopilot ? ' · 托管' : ''}
              </div>
            </div>
            <span className="text-sm font-bold text-muted-foreground tabular-nums shrink-0">
              {p.handCount} 张
            </span>
          </div>
        );
      })}

      {spectators.length > 0 && (
        <>
          <div className="text-xs text-muted-foreground font-bold mt-2 mb-1 px-1">观战（{spectators.length}）</div>
          {spectators.map((s) => {
            const isQueued = pendingJoinQueue.includes(s.nickname);
            return (
              <div key={s.nickname} className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs overflow-hidden shrink-0 border',
                    isQueued ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-white/10 border-white/10 text-muted-foreground',
                    !s.connected && 'opacity-40',
                  )}
                >
                  {s.avatarUrl
                    ? <img src={s.avatarUrl} className="w-full h-full object-cover" alt="" />
                    : s.nickname.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-muted-foreground truncate">{s.nickname}</span>
                {isQueued && <span className="text-[11px] text-primary shrink-0">下局加入</span>}
                {!s.connected && <span className="text-[11px] text-destructive/70 shrink-0">断线</span>}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

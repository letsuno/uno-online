import { Eye } from 'lucide-react';
import PlayerCompass from './PlayerCompass';
import StageCenter from './StageCenter';
import SpectatorDock from '../SpectatorDock';
import { useGameStore } from '../../stores/game-store';
import { useSpectatorStore } from '../../stores/spectator-store';
import { useShortLandscape } from '../../hooks/useGameLayoutMode';
import { cn } from '@/shared/lib/utils';

interface SpectatorViewProps {
  onDraw: (side: 'left' | 'right') => void;
  onBackToLobby: () => void;
  onJoined: () => void;
  /** 覆盖层（弹幕、回合横幅） */
  children?: React.ReactNode;
}

/**
 * 移动端观战布局（替代沿用 PC 的浮层方案）：
 * 内联观战横幅（下局加入/退出 + 观战头像列表）+ 玩家行 + 牌桌区 + 抓 UNO 区。
 */
export default function SpectatorView({ onDraw, onBackToLobby, onJoined, children }: SpectatorViewProps) {
  const compact = useShortLandscape();
  const phase = useGameStore((s) => s.phase);
  const spectators = useSpectatorStore((s) => s.spectators);
  const pendingJoinQueue = useSpectatorStore((s) => s.pendingJoinQueue);
  const showScoreBoard = phase === 'round_end' || phase === 'game_over';

  return (
    <>
      {/* 观战横幅（短横屏隐藏，空间让给舞台；观战操作在控制坞） */}
      {!showScoreBoard && !compact && (
        <div className="shrink-0 mx-3 mt-1.5 glass-panel-sm flex items-center gap-2 px-3 py-2">
          <Eye size={15} className="text-primary shrink-0" />
          <span className="text-xs text-muted-foreground font-game shrink-0">观战中</span>
          {/* 观战头像列表（含排队状态） */}
          {spectators.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hidden min-w-0">
              {spectators.map((s) => {
                const isQueued = pendingJoinQueue.includes(s.nickname);
                return (
                  <div
                    key={s.nickname}
                    title={s.nickname + (isQueued ? ' (下局加入)' : '') + (!s.connected ? ' (已断线)' : '')}
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[10px] border shrink-0 overflow-hidden',
                      isQueued
                        ? 'bg-primary/20 border-primary/50 text-primary'
                        : 'bg-white/10 border-white/10 text-muted-foreground',
                      !s.connected && 'opacity-40',
                    )}
                  >
                    {s.avatarUrl
                      ? <img src={s.avatarUrl} alt={s.nickname} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      : s.nickname.charAt(0).toUpperCase()}
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* 玩家行 + 牌桌区（与正常对局一致的视觉） */}
      <div className="shrink-0 py-1.5">
        <PlayerCompass compact={compact} />
      </div>
      <div className="relative flex flex-col flex-1 min-h-0">
        <StageCenter compact={compact} onDraw={onDraw} />
        {children}
      </div>

      <SpectatorDock compact={compact} onBackToLobby={onBackToLobby} onJoined={onJoined} />
    </>
  );
}

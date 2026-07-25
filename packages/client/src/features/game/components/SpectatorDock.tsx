import { useEffect, useState } from 'react';
import { LogOut, UserPlus, X } from 'lucide-react';
import SpectatorActions from './SpectatorActions';
import { useGameStore } from '../stores/game-store';
import { useSpectatorStore } from '../stores/spectator-store';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useGameActions } from '../hooks/useGameActions';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { cn } from '@/shared/lib/utils';

const EMOJIS = ['👍', '😂', '🎉', '😱', '💪'];

interface SpectatorDockProps {
  onBackToLobby: () => void;
  onJoined: () => void;
  /** 短横屏：全部压成单行 */
  compact?: boolean;
}

/**
 * 观战控制坞（PC 底部控制条 / 移动端底部控制坞共享）：
 * 抓 UNO + 快捷表情 + 下局加入/取消 + 退出。
 */
export default function SpectatorDock({ onBackToLobby, onJoined, compact = false }: SpectatorDockProps) {
  const { catchUno } = useGameActions();
  const pendingJoinQueue = useSpectatorStore((s) => s.pendingJoinQueue);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    const nickname = useAuthStore.getState().user?.nickname;
    if (nickname && pendingJoinQueue.includes(nickname)) setQueued(true);
  }, [pendingJoinQueue]);

  useEffect(() => {
    const socket = getSocket();
    const handleState = () => {
      const { isSpectator } = useGameStore.getState();
      if (!isSpectator && queued) {
        onJoined();
        setQueued(false);
      }
    };
    socket.on('game:state', handleState);
    return () => { socket.off('game:state', handleState); };
  }, [queued, onJoined]);

  const toggleQueue = () => {
    getSocket().emit('game:spectator_join', (res: { success?: boolean; error?: string; queued?: boolean; joined?: boolean }) => {
      if (res?.success) {
        if (res.joined) {
          onJoined();
          setQueued(false);
        } else {
          setQueued(res.queued ?? false);
        }
      } else {
        useToastStore.getState().addToast(res?.error ?? '操作失败', 'error');
      }
    });
  };

  const sendEmoji = (emoji: string) => getSocket().emit('chat:message', { text: emoji });

  const joinButton = queued ? (
    <button
      onClick={toggleQueue}
      className={cn(
        'rounded-btn bg-secondary border border-border text-foreground text-sm font-bold cursor-pointer active:bg-white/10 flex items-center justify-center gap-2',
        compact ? 'h-10 px-4' : 'w-full h-12',
      )}
    >
      <X size={15} /> 取消加入
    </button>
  ) : (
    <button
      onClick={toggleQueue}
      className={cn(
        'rounded-btn gold-button-base text-sm cursor-pointer active:opacity-90 flex items-center justify-center gap-2',
        compact ? 'h-10 px-4' : 'w-full h-12',
      )}
    >
      <UserPlus size={16} /> 下局加入
    </button>
  );

  const emojiRow = (
    <div className="flex items-center gap-1.5">
      {!compact && <span className="text-[11px] text-muted-foreground shrink-0">表情</span>}
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => sendEmoji(emoji)}
          className={cn(
            'rounded-lg bg-secondary border border-border flex items-center justify-center cursor-pointer active:scale-90 transition-transform',
            compact ? 'w-8 h-8 text-base' : 'w-9 h-9 text-lg',
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  );

  const exitButton = (
    <button
      onClick={onBackToLobby}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-secondary text-foreground cursor-pointer active:bg-white/10 shrink-0',
        compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-1.5 text-xs',
      )}
      title="退出对局"
    >
      <LogOut size={12} /> 退出
    </button>
  );

  if (compact) {
    return (
      <div className="shrink-0 mx-3 mb-1.5 glass-panel-sm flex items-center gap-2 px-3 py-2">
        <SpectatorActions onCatchUno={catchUno} />
        {emojiRow}
        <div className="ml-auto flex items-center gap-2">
          {joinButton}
          {exitButton}
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 mx-3 mb-2 glass-panel-sm flex flex-col gap-2.5 px-3.5 py-3">
      <SpectatorActions onCatchUno={catchUno} />
      <div className="flex items-center gap-2">
        {emojiRow}
        <div className="ml-auto">{exitButton}</div>
      </div>
      {joinButton}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Trophy, BarChart3, Crown, Check, UserX, UserPlus, WifiOff, Eye, X, ArrowRightLeft } from 'lucide-react';
import { MAX_PLAYERS } from '@uno-online/shared';
import { showConfirm } from '@/shared/stores/confirm-store';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import PlayerAvatar from './PlayerAvatar';
import { useRoomStore } from '@/shared/stores/room-store';
import { useSpectatorStore } from '../stores/spectator-store';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/Button';
import { AiBadge } from '@/shared/components/ui/AiBadge';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { serverNow } from '@/shared/server-time';

const START_COOLDOWN_S = 10;

interface ScoreBoardProps {
  isSpectator?: boolean;
  onPlayAgain: () => void;
  onBackToRoom: () => void;
  onBackToLobby: () => void;
  onKickPlayer: (targetId: string) => void;
  onLeaveToSpectate: () => void;
  onJoinedFromSpectator?: () => void;
}

export default function ScoreBoard({ isSpectator = false, onPlayAgain, onBackToRoom, onBackToLobby, onKickPlayer, onLeaveToSpectate, onJoinedFromSpectator }: ScoreBoardProps) {
  const players = useGameStore((s) => s.players);
  const winnerId = useGameStore((s) => s.winnerId);
  const phase = useGameStore((s) => s.phase);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const vote = useGameStore((s) => s.nextRoundVote);
  const roundEndAt = useGameStore((s) => s.roundEndAt);
  const gameOverAt = useGameStore((s) => s.gameOverAt);
  const pendingJoinQueue = useSpectatorStore((s) => s.pendingJoinQueue);
  const [leaveCountdown, setLeaveCountdown] = useState(5);
  const [startCooldown, setStartCooldown] = useState(() => {
    const endAt = roundEndAt ?? gameOverAt;
    if (endAt) return Math.max(0, START_COOLDOWN_S - Math.floor((serverNow() - endAt) / 1000));
    return START_COOLDOWN_S;
  });
  const [spectatorQueued, setSpectatorQueued] = useState(() => {
    const nickname = useAuthStore.getState().user?.nickname;
    return !!nickname && pendingJoinQueue.includes(nickname);
  });
  useEffect(() => {
    setLeaveCountdown(5);
    const interval = setInterval(() => {
      setLeaveCountdown((c) => { if (c <= 1) { clearInterval(interval); return 0; } return c - 1; });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    const endAt = roundEndAt ?? gameOverAt;
    const initial = endAt
      ? Math.max(0, START_COOLDOWN_S - Math.floor((serverNow() - endAt) / 1000))
      : START_COOLDOWN_S;
    setStartCooldown(initial);
    if (initial <= 0) return;
    const interval = setInterval(() => {
      setStartCooldown((c) => { if (c <= 1) { clearInterval(interval); return 0; } return c - 1; });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, roundEndAt, gameOverAt]);

  useEffect(() => {
    const nickname = useAuthStore.getState().user?.nickname;
    if (nickname && pendingJoinQueue.includes(nickname)) {
      setSpectatorQueued(true);
    }
  }, [pendingJoinQueue]);

  useEffect(() => {
    if (!isSpectator || !spectatorQueued) return;
    const socket = getSocket();
    const handleState = () => {
      const { isSpectator: still } = useGameStore.getState();
      if (!still && spectatorQueued) {
        onJoinedFromSpectator?.();
        setSpectatorQueued(false);
      }
    };
    socket.on('game:state', handleState);
    return () => { socket.off('game:state', handleState); };
  }, [isSpectator, spectatorQueued, onJoinedFromSpectator]);

  const toggleSpectatorQueue = () => {
    getSocket().emit('game:spectator_join', (res: { success?: boolean; error?: string; queued?: boolean; joined?: boolean }) => {
      if (res?.success) {
        if (res.joined) {
          onJoinedFromSpectator?.();
        } else {
          setSpectatorQueued(res.queued ?? false);
        }
      } else {
        useToastStore.getState().addToast(res?.error ?? '操作失败', 'error');
      }
    });
  };

  const ownerId = useRoomStore((s) => s.room?.ownerId);
  const userId = useEffectiveUserId();
  const authUserId = useAuthStore((s) => s.user?.id);
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const isGameOver = phase === 'game_over';
  // Spectator views use the synthetic "__spectator__" viewerId. Room
  // ownership, however, always belongs to the authenticated user.
  const isHost = !!authUserId && ownerId === authUserId;
  const isSpectatorOwner = isSpectator && isHost;
  const hasVoted = !!authUserId && !!vote?.voters.includes(authUserId);
  const fallbackRequired = players.length;
  const votes = vote?.votes ?? 0;
  const required = vote?.required ?? fallbackRequired;
  const allAgreed = votes >= required;
  const cooldownActive = startCooldown > 0;
  const noHumanPlayers = required === 0;
  const spectatorQueueFull = players.length + pendingJoinQueue.length >= MAX_PLAYERS;
  const spectatorOwnerNeedsSeat = isSpectatorOwner && !spectatorQueued && spectatorQueueFull;
  const nextRoundButtonText = isSpectatorOwner && !spectatorQueued
    ? '请先加入下局'
    : isHost
      ? noHumanPlayers
        ? '开始下一轮'
        : hasVoted
          ? allAgreed
            ? '开始下一轮'
            : `等待同意 (${votes}/${required})`
          : `同意继续 (${votes}/${required})`
      : hasVoted
        ? allAgreed
          ? '等待房主开始'
          : `已同意 (${votes}/${required})`
        : `同意继续 (${votes}/${required})`;
  const isNextRoundDisabled = !isGameOver && (
    (isSpectatorOwner && !spectatorQueued)
    || (isHost
      ? noHumanPlayers ? cooldownActive : hasVoted && (!allAgreed || cooldownActive)
      : hasVoted)
  );

  return (
    <div className="fixed inset-0 glass-modal-backdrop flex items-center justify-center z-modal">
      <div className="glass-panel w-[460px] max-w-[94vw] px-7 py-6 max-md:px-5 text-center">
        <h2 className="font-game text-lg font-black text-accent mb-5 inline-flex items-center gap-2">
          {isGameOver
            ? <><Trophy size={18} /> 游戏结束</>
            : <><BarChart3 size={18} /> {roundNumber > 0 ? `第 ${roundNumber} 轮结束` : '本轮结束'}</>}
        </h2>

        {/* 排名列表 */}
        <div className="flex flex-col gap-1.5 mb-5">
          {sorted.map((p, rank) => {
            const ready = !!vote?.voters.includes(p.id);
            const disconnected = !p.connected;
            const isSelf = p.id === userId;
            const isWinner = p.id === winnerId;
            const playerIndex = players.findIndex((pl) => pl.id === p.id);
            return (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl pl-2.5 pr-3.5 py-2 border text-left',
                  isWinner
                    ? 'bg-primary/[0.08] border-primary/30'
                    : 'bg-white/[0.03] border-transparent',
                  disconnected && 'opacity-60',
                )}
              >
                {/* 名次徽章：前三名奖牌色 */}
                <span className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-black tabular-nums shrink-0',
                  rank === 0 && 'bg-primary text-background',
                  rank === 1 && 'bg-white/25 text-foreground',
                  rank === 2 && 'bg-[#b0793f]/55 text-foreground',
                  rank > 2 && 'bg-white/[0.06] text-muted-foreground',
                )}>
                  {rank + 1}
                </span>

                {/* 头像（冠军戴皇冠角标） */}
                <div className="relative shrink-0">
                  <PlayerAvatar index={playerIndex} name={p.name} avatarUrl={p.avatarUrl} isBot={p.isBot} botConfig={p.botConfig} size={32} highlighted={isWinner} />
                  {isWinner && <Crown size={13} className="absolute -top-2 -right-1.5 rotate-[18deg] text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />}
                </div>

                {/* 名字 + 徽记 */}
                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                  <span className={cn('text-sm truncate', isWinner ? 'text-primary font-bold' : 'text-foreground')}>{p.name}</span>
                  {isSelf && <span className="shrink-0 inline-flex items-center rounded bg-primary/15 text-primary text-[10px] leading-none px-1 py-0.5">你</span>}
                  {p.id === ownerId && <span title="房主"><Crown size={11} className="shrink-0 text-primary" /></span>}
                  {p.isBot && <AiBadge className="shrink-0" />}
                  {disconnected && <WifiOff size={11} className="shrink-0 text-destructive" />}
                  {isHost && !isSelf && !p.isBot && (
                    <button
                      onClick={async () => {
                        if (!(await showConfirm({ title: '移交房主', message: `确定要将房主移交给 ${p.name} 吗？`, confirmText: '移交' }))) return;
                        getSocket().emit('room:transfer_owner', { targetId: p.id }, (res: { success?: boolean; error?: string }) => {
                          if (!res?.success) useToastStore.getState().addToast(res?.error ?? '移交失败', 'error');
                        });
                      }}
                      className="shrink-0 text-primary/50 hover:text-primary cursor-pointer bg-transparent border-none transition-colors"
                      title="移交房主"
                    >
                      <ArrowRightLeft size={11} />
                    </button>
                  )}
                </div>

                {/* 状态（下一轮准备/踢人）+ 分数 */}
                <div className="flex items-center gap-2 shrink-0">
                  {!isGameOver && (
                    <>
                      {ready
                        ? <span className="w-4.5 h-4.5 rounded-full bg-uno-green/15 flex items-center justify-center" title="已同意下一轮"><Check size={11} className="text-uno-green" /></span>
                        : <span className="text-[10px] text-muted-foreground/70">等待</span>}
                      {isHost && !isSelf && (
                        <button onClick={() => onKickPlayer(p.id)} className="text-destructive/60 hover:text-destructive cursor-pointer bg-transparent border-none transition-colors" title={p.isBot ? '移除机器人' : '移至观战席'}>
                          <UserX size={13} />
                        </button>
                      )}
                    </>
                  )}
                  <span className={cn('min-w-[36px] text-right font-black tabular-nums', isWinner ? 'text-primary text-base' : 'text-foreground text-sm')}>
                    {p.score}
                    <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">分</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {isSpectatorOwner && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 text-xs text-primary">
            <Crown size={14} className="shrink-0" />
            <span>
              {spectatorQueued
                ? '你将在下一轮入座，也可以将房主移交给在座的玩家'
                : spectatorOwnerNeedsSeat
                  ? '你是观战房主且房间已满，请先移除一名在座玩家或机器人，再加入下一轮；也可以移交房主'
                  : '你是房主但处于观战状态，请加入下一轮或将房主移交给在座的玩家'}
            </span>
          </div>
        )}
        {!isGameOver && pendingJoinQueue.length > 0 && (
          <p className="mb-2 text-xs text-accent flex items-center justify-center gap-1">
            <UserPlus size={12} /> {pendingJoinQueue.join('、')} 将在下一轮加入
          </p>
        )}
        {!isGameOver && !isSpectator && (
          <p className="mb-3 text-xs text-muted-foreground">
            {allAgreed ? '所有玩家已同意，等待房主开始下一轮' : `已有 ${votes}/${required} 人同意继续下一轮`}
          </p>
        )}
        {cooldownActive && (
          <div className="mb-3 mx-auto max-w-xs">
            <p className="text-xs text-muted-foreground mb-1">
              {isGameOver ? `${startCooldown}s 后可返回房间` : `${startCooldown}s 后可开始下一轮`}
            </p>
            <div className="h-1 rounded-full bg-muted-foreground/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent"
                style={{
                  width: `${(startCooldown / START_COOLDOWN_S) * 100}%`,
                  transition: 'width 1s linear',
                }}
              />
            </div>
          </div>
        )}
        {isSpectator ? (
          <div className="flex gap-3 justify-center flex-wrap">
            {!isGameOver && isHost && <Button variant="primary" onClick={onPlayAgain} disabled={isNextRoundDisabled} sound="ready">{nextRoundButtonText}</Button>}
            {!isGameOver && (() => {
              const locked = spectatorQueued && isSpectatorOwner;
              const queueBlocked = !spectatorQueued && spectatorQueueFull;
              const Icon = spectatorQueued ? (locked ? Check : X) : queueBlocked && isSpectatorOwner ? UserX : UserPlus;
              const label = spectatorQueued
                ? locked ? '已加入下局' : '取消加入'
                : queueBlocked
                  ? isSpectatorOwner ? '请先腾出座位' : '房间已满'
                  : '下局加入';
              return (
                <Button variant="secondary" onClick={locked || queueBlocked ? undefined : toggleSpectatorQueue} disabled={locked || queueBlocked} sound={spectatorQueued ? 'click' : 'ready'}>
                  <Icon size={14} className="inline align-middle mr-1" />{label}
                </Button>
              );
            })()}
            {isGameOver && isHost && <Button variant="primary" onClick={onBackToRoom} disabled={cooldownActive} sound="ready">返回房间</Button>}
            {isGameOver && !isHost && <Button variant="primary" disabled>等待房主返回房间…</Button>}
            <Button variant="secondary" onClick={onBackToLobby} sound="click" disabled={leaveCountdown > 0}>{leaveCountdown > 0 ? `返回大厅 (${leaveCountdown}s)` : '返回大厅'}</Button>
          </div>
        ) : (
          <div className="flex gap-3 justify-center flex-wrap">
            {!isGameOver && <Button variant="primary" onClick={onPlayAgain} disabled={isNextRoundDisabled} sound="ready">{nextRoundButtonText}</Button>}
            {isGameOver && isHost && <Button variant="primary" onClick={onBackToRoom} disabled={cooldownActive} sound="ready">返回房间</Button>}
            {isGameOver && !isHost && <Button variant="primary" disabled>等待房主返回房间…</Button>}
            <Button variant="secondary" onClick={onLeaveToSpectate} sound="click"><Eye size={14} className="inline align-middle mr-1" />进入观战席</Button>
            <Button variant="secondary" onClick={onBackToLobby} sound="click" disabled={leaveCountdown > 0}>{leaveCountdown > 0 ? `返回大厅 (${leaveCountdown}s)` : '返回大厅'}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

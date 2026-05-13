import { useState, useEffect, useRef } from 'react';
import { Trophy, BarChart3, Crown, Check, UserX, UserPlus, WifiOff, Eye, X } from 'lucide-react';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useRoomStore } from '@/shared/stores/room-store';
import { useSpectatorStore } from '../stores/spectator-store';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/Button';
import { AiBadge } from '@/shared/components/ui/AiBadge';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';

const KICK_DELAY_S = 30;
const START_COOLDOWN_S = 10;

function KickCountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 7;
  const circumference = 2 * Math.PI * r;
  const progress = Math.max(0, remaining / total);

  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="inline align-middle">
      <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/20" />
      <circle
        cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2"
        className="text-destructive"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        strokeLinecap="round"
        transform="rotate(-90 9 9)"
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
      <text x="9" y="9" textAnchor="middle" dominantBaseline="central" className="fill-muted-foreground" fontSize="7">{remaining}</text>
    </svg>
  );
}

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
  const vote = useGameStore((s) => s.nextRoundVote);
  const roundEndAt = vote?.roundEndAt ?? null;
  const gameOverAt = useGameStore((s) => s.gameOverAt);
  const pendingJoinQueue = useSpectatorStore((s) => s.pendingJoinQueue);
  const [kickCountdown, setKickCountdown] = useState(() => {
    if (!roundEndAt) return KICK_DELAY_S;
    return Math.max(0, KICK_DELAY_S - Math.floor((Date.now() - roundEndAt) / 1000));
  });
  const [leaveCountdown, setLeaveCountdown] = useState(5);
  const [startCooldown, setStartCooldown] = useState(() => {
    const endAt = roundEndAt ?? gameOverAt;
    if (endAt) return Math.max(0, START_COOLDOWN_S - Math.floor((Date.now() - endAt) / 1000));
    return START_COOLDOWN_S;
  });
  const [spectatorQueued, setSpectatorQueued] = useState(() => {
    const nickname = useAuthStore.getState().user?.nickname;
    return !!nickname && pendingJoinQueue.includes(nickname);
  });
  const kickTimerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (phase !== 'round_end' || !roundEndAt) { setKickCountdown(KICK_DELAY_S); return; }
    const calc = () => Math.max(0, KICK_DELAY_S - Math.floor((Date.now() - roundEndAt) / 1000));
    setKickCountdown(calc());
    kickTimerRef.current = setInterval(() => {
      const v = calc();
      setKickCountdown(v);
      if (v <= 0) clearInterval(kickTimerRef.current);
    }, 1000);
    return () => clearInterval(kickTimerRef.current);
  }, [phase, roundEndAt]);

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
      ? Math.max(0, START_COOLDOWN_S - Math.floor((Date.now() - endAt) / 1000))
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
    getSocket().emit('game:spectator_join', (res: { success?: boolean; error?: string; queued?: boolean }) => {
      if (res?.success) {
        setSpectatorQueued(res.queued ?? false);
      } else {
        useToastStore.getState().addToast(res?.error ?? '操作失败', 'error');
      }
    });
  };

  const ownerId = useRoomStore((s) => s.room?.ownerId);
  const userId = useEffectiveUserId();
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const isGameOver = phase === 'game_over';
  const isHost = ownerId === userId;
  const hasVoted = !!userId && !!vote?.voters.includes(userId);
  const fallbackRequired = players.length;
  const votes = vote?.votes ?? 0;
  const required = vote?.required ?? fallbackRequired;
  const allAgreed = votes >= required;
  const canKick = kickCountdown === 0;
  const cooldownActive = startCooldown > 0;
  const nextRoundButtonText = cooldownActive
    ? `${startCooldown}s`
    : isHost
      ? allAgreed
        ? '开始下一轮'
        : hasVoted
          ? `等待同意 (${votes}/${required})`
          : `同意继续 (${votes}/${required})`
      : hasVoted
        ? allAgreed
          ? '等待房主开始'
          : `已同意 (${votes}/${required})`
        : `同意继续 (${votes}/${required})`;
  const isNextRoundDisabled = cooldownActive || (!isGameOver && (
    isHost ? hasVoted && !allAgreed : hasVoted
  ));

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-modal">
      <div className="bg-card rounded-panel px-10 py-8 min-w-room-min text-center">
        <h2 className="font-game text-accent mb-4">
          {isGameOver ? <><Trophy size={20} className="inline align-middle" /> 游戏结束!</> : <><BarChart3 size={20} className="inline align-middle" /> 本轮结束</>}
        </h2>
        <table className="w-full border-collapse mb-5">
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th className="text-left px-2 py-1">玩家</th>
              {!isGameOver && <th className="px-2 py-1">状态</th>}
              <th className="text-right px-2 py-1">分数</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const ready = !!vote?.voters.includes(p.id);
              const disconnected = !p.connected;
              const isSelf = p.id === userId;
              return (
                <tr key={p.id} className={cn(p.id === winnerId ? 'text-accent' : 'text-foreground')}>
                  <td className="px-2 py-1.5 text-left">
                    {p.id === winnerId && <Crown size={14} className="inline align-middle mr-1" />}
                    <span className={cn(disconnected && 'opacity-50')}>{p.name}</span>
                    {p.isBot && <AiBadge className="ml-1" />}
                    {disconnected && <WifiOff size={12} className="inline align-middle ml-1 text-destructive" />}
                  </td>
                  {!isGameOver && (
                    <td className="px-2 py-1.5 text-center whitespace-nowrap">
                      {ready
                        ? <Check size={14} className="inline text-green-400" />
                        : isSpectator
                          ? <span className="text-xs text-muted-foreground">等待中</span>
                          : isSelf
                            ? <span className="text-xs text-muted-foreground">等待中</span>
                            : isHost && canKick
                              ? <button onClick={() => onKickPlayer(p.id)} className="text-xs text-destructive hover:text-destructive/80 cursor-pointer bg-transparent border-none" title="移至观战席"><UserX size={14} className="inline" /></button>
                              : disconnected
                                ? canKick
                                  ? <span className="text-xs text-destructive">已超时</span>
                                  : <KickCountdownRing remaining={kickCountdown} total={KICK_DELAY_S} />
                                : <span className="text-xs text-muted-foreground">等待中</span>}
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-right font-bold">{p.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
        {isSpectator ? (
          <div className="flex gap-3 justify-center flex-wrap">
            {spectatorQueued ? (
              <Button variant="secondary" onClick={toggleSpectatorQueue} sound="click">
                <X size={14} className="inline align-middle mr-1" />取消加入
              </Button>
            ) : (
              <Button variant="primary" onClick={toggleSpectatorQueue} sound="ready">
                <UserPlus size={14} className="inline align-middle mr-1" />加入下一轮
              </Button>
            )}
            <Button variant="secondary" onClick={onBackToLobby} sound="click" disabled={leaveCountdown > 0}>{leaveCountdown > 0 ? `返回大厅 (${leaveCountdown}s)` : '返回大厅'}</Button>
          </div>
        ) : (
          <div className="flex gap-3 justify-center flex-wrap">
            {!isGameOver && <Button variant="primary" onClick={onPlayAgain} disabled={isNextRoundDisabled} sound="ready">{nextRoundButtonText}</Button>}
            {isGameOver && isHost && <Button variant="primary" onClick={onBackToRoom} disabled={cooldownActive} sound="ready">{cooldownActive ? `返回房间 (${startCooldown}s)` : '返回房间'}</Button>}
            {isGameOver && !isHost && <Button variant="primary" disabled>{cooldownActive ? `${startCooldown}s` : '等待房主返回房间…'}</Button>}
            {!isHost && <Button variant="secondary" onClick={onLeaveToSpectate} sound="click"><Eye size={14} className="inline align-middle mr-1" />进入观战席</Button>}
            <Button variant="secondary" onClick={onBackToLobby} sound="click" disabled={leaveCountdown > 0}>{leaveCountdown > 0 ? `返回大厅 (${leaveCountdown}s)` : '返回大厅'}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

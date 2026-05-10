import { useState, useEffect } from 'react';
import { Trophy, BarChart3, Crown, Check, UserX } from 'lucide-react';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useRoomStore } from '@/shared/stores/room-store';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/Button';

const KICK_DELAY_MS = 30_000;

interface ScoreBoardProps {
  onPlayAgain: () => void;
  onRematch: () => void;
  onBackToLobby: () => void;
  onKickPlayer: (targetId: string) => void;
}

export default function ScoreBoard({ onPlayAgain, onRematch, onBackToLobby, onKickPlayer }: ScoreBoardProps) {
  const players = useGameStore((s) => s.players);
  const winnerId = useGameStore((s) => s.winnerId);
  const phase = useGameStore((s) => s.phase);
  const vote = useGameStore((s) => s.nextRoundVote);
  const [canKick, setCanKick] = useState(false);

  useEffect(() => {
    if (phase !== 'round_end') { setCanKick(false); return; }
    const timer = setTimeout(() => setCanKick(true), KICK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase]);
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
  const nextRoundButtonText = isHost
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
  const isNextRoundDisabled = !isGameOver && (
    isHost ? hasVoted && !allAgreed : hasVoted
  );

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
              return (
                <tr key={p.id} className={cn(p.id === winnerId ? 'text-accent' : 'text-foreground')}>
                  <td className="px-2 py-1.5 text-left">{p.id === winnerId && <Crown size={14} className="inline align-middle mr-1" />}{p.name}</td>
                  {!isGameOver && (
                    <td className="px-2 py-1.5 text-center whitespace-nowrap">
                      {ready
                        ? <Check size={14} className="inline text-green-400" />
                        : isHost && canKick && p.id !== userId
                          ? <button onClick={() => onKickPlayer(p.id)} className="text-xs text-destructive hover:text-destructive/80 cursor-pointer bg-transparent border-none" title="踢出游戏"><UserX size={14} className="inline" /></button>
                          : <span className="text-xs text-muted-foreground">等待中</span>}
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-right font-bold">{p.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isGameOver && (
          <p className="mb-3 text-xs text-muted-foreground">
            {allAgreed ? '所有玩家已同意，等待房主开始下一轮' : `已有 ${votes}/${required} 人同意继续下一轮`}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          {!isGameOver && <Button variant="primary" onClick={onPlayAgain} disabled={isNextRoundDisabled} sound="ready">{nextRoundButtonText}</Button>}
          {isGameOver && <Button variant="primary" onClick={onRematch} sound="ready">再来一局</Button>}
          <Button variant="secondary" onClick={onBackToLobby} sound="click">返回大厅</Button>
        </div>
      </div>
    </div>
  );
}

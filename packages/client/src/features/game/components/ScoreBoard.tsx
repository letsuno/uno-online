import { Trophy, BarChart3, Crown } from 'lucide-react';
import { useGameStore } from '../stores/game-store';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/Button';

interface ScoreBoardProps { onPlayAgain: () => void; onRematch: () => void; onBackToLobby: () => void; }

export default function ScoreBoard({ onPlayAgain, onRematch, onBackToLobby }: ScoreBoardProps) {
  const players = useGameStore((s) => s.players);
  const winnerId = useGameStore((s) => s.winnerId);
  const phase = useGameStore((s) => s.phase);
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const isGameOver = phase === 'game_over';

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
              <th className="text-right px-2 py-1">分数</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className={cn(p.id === winnerId ? 'text-accent' : 'text-foreground')}>
                <td className="px-2 py-1.5 text-left">{p.id === winnerId && <Crown size={14} className="inline align-middle mr-1" />}{p.name}</td>
                <td className="px-2 py-1.5 text-right font-bold">{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-3 justify-center">
          {!isGameOver && <Button variant="primary" onClick={onPlayAgain}>继续下一轮</Button>}
          {isGameOver && <Button variant="primary" onClick={onRematch}>再来一局</Button>}
          <Button variant="secondary" onClick={onBackToLobby}>返回大厅</Button>
        </div>
      </div>
    </div>
  );
}

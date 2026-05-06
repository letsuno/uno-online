import { Trophy, BarChart3, Crown } from 'lucide-react';
import { useGameStore } from '../stores/game-store';

interface ScoreBoardProps { onPlayAgain: () => void; onRematch: () => void; onBackToLobby: () => void; }

export default function ScoreBoard({ onPlayAgain, onRematch, onBackToLobby }: ScoreBoardProps) {
  const players = useGameStore((s) => s.players);
  const winnerId = useGameStore((s) => s.winnerId);
  const phase = useGameStore((s) => s.phase);
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const isGameOver = phase === 'game_over';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, padding: '32px 40px', minWidth: 300, textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-game)', color: 'var(--text-accent)', marginBottom: 16 }}>
          {isGameOver ? <><Trophy size={20} style={{ verticalAlign: 'middle' }} /> 游戏结束!</> : <><BarChart3 size={20} style={{ verticalAlign: 'middle' }} /> 本轮结束</>}
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <thead>
            <tr style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>玩家</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>分数</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} style={{ color: p.id === winnerId ? 'var(--text-accent)' : 'var(--text-primary)' }}>
                <td style={{ padding: '6px 8px', textAlign: 'left' }}>{p.id === winnerId && <Crown size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />}{p.name}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          {!isGameOver && <button className="btn-primary" onClick={onPlayAgain}>继续下一轮</button>}
          {isGameOver && <button className="btn-primary" onClick={onRematch}>再来一局</button>}
          <button className="btn-secondary" onClick={onBackToLobby}>返回大厅</button>
        </div>
      </div>
    </div>
  );
}

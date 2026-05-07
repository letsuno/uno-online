interface ScoreTableProps {
  players: { userId: string; nickname: string; placement: number; finalScore: number }[];
}

export default function ScoreTable({ players }: ScoreTableProps) {
  return (
    <div className="bg-card/80 rounded-panel-ui p-3">
      <h3 className="text-sm text-muted-foreground mb-2">最终排名</h3>
      <div className="flex flex-col gap-1">
        {players.map((p) => (
          <div key={p.userId} className="flex justify-between text-sm">
            <span>
              {p.placement === 1 ? '# 1 ' : `#${p.placement} `}
              {p.nickname}
            </span>
            <span className="text-muted-foreground">{p.finalScore} 分</span>
          </div>
        ))}
      </div>
    </div>
  );
}

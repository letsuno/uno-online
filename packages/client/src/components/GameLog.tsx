import { useEffect, useRef } from 'react';
import { useGameLogStore } from '../stores/game-log-store';
import { useGameStore } from '../stores/game-store';
import GameLogEntry from './GameLogEntry';

export default function GameLog() {
  const entries = useGameLogStore((s) => s.entries);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div className="hidden md:block fixed right-4 bottom-24 w-chat-w max-h-[60vh] overflow-y-auto scrollbar-hidden z-fab bg-card/80 backdrop-blur-sm rounded-xl border border-white/10 p-3" ref={scrollRef}>
      <h3 className="text-sm font-game font-bold text-accent mb-2">
        {'📖'} 游戏日记 {roundNumber > 0 && <span className="text-2xs text-muted-foreground font-normal">第{roundNumber}回合</span>}
      </h3>

      {entries.length === 0 ? (
        <p className="text-2xs text-muted-foreground">暂无记录</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {entries.map((entry) => (
            <GameLogEntry key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

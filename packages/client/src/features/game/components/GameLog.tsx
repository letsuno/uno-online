import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useGameLogStore } from '../stores/game-log-store';
import { useGameStore } from '../stores/game-store';
import GameLogEntry from './GameLogEntry';

interface GameLogProps {
  embedded?: boolean;
}

export default function GameLog({ embedded = false }: GameLogProps) {
  const entries = useGameLogStore((s) => s.entries);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  if (embedded) {
    return (
      <div className="w-full" ref={scrollRef}>
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

  return (
    <div className="hidden md:block fixed right-4 bottom-24 w-chat-w z-fab bg-card/80 backdrop-blur-sm rounded-xl border border-white/10" ref={scrollRef}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between w-full px-3 py-2 cursor-pointer text-left"
      >
        <h3 className="text-sm font-game font-bold text-accent m-0">
          {'📖'} 游戏日记 {roundNumber > 0 && <span className="text-2xs text-muted-foreground font-normal">第{roundNumber}回合</span>}
        </h3>
        {collapsed ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>
      {!collapsed && (
        <div className="px-3 pb-3 max-h-[50vh] overflow-y-auto scrollbar-hidden">
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
      )}
    </div>
  );
}

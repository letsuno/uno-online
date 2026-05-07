import { useEffect, useRef, useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useGameLogStore } from '../stores/game-log-store';
import { useGameStore } from '../stores/game-store';
import GameLogEntry from './GameLogEntry';

interface GameLogProps {
  embedded?: boolean;
}

function RoundSeparator({ roundNumber }: { roundNumber: number }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex-1 border-t border-white/10" />
      <span className="text-2xs text-muted-foreground whitespace-nowrap">第{roundNumber}回合</span>
      <div className="flex-1 border-t border-white/10" />
    </div>
  );
}

export default function GameLog({ embedded = false }: GameLogProps) {
  const entries = useGameLogStore((s) => s.entries);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  const reversedEntries = useMemo(() => [...entries].reverse(), [entries]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = 0;
    }
  }, [entries.length]);

  const renderEntries = (list: typeof entries) => (
    <div className="flex flex-col gap-0.5">
      {list.map((entry) =>
        entry.type === 'round_separator' ? (
          <RoundSeparator key={entry.id} roundNumber={entry.roundNumber ?? 0} />
        ) : (
          <GameLogEntry key={entry.id} entry={entry} />
        )
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="w-full" ref={scrollRef}>
        {entries.length === 0 ? (
          <p className="text-2xs text-muted-foreground">暂无记录</p>
        ) : (
          renderEntries(reversedEntries)
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
        <div className="px-3 pb-3 max-h-[50vh] overflow-y-auto scrollbar-thin">
          {entries.length === 0 ? (
            <p className="text-2xs text-muted-foreground">暂无记录</p>
          ) : (
            renderEntries(reversedEntries)
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { Bot, Plus } from 'lucide-react';
import type { BotDifficulty } from '@uno-online/shared';
import { useBotManagement } from '../hooks/useBotManagement';
import { DIFFICULTY_LIST } from '../constants/bot-difficulty';

export function BotAddButton() {
  const [open, setOpen] = useState(false);
  const { addBot } = useBotManagement();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleAdd = (difficulty: BotDifficulty) => {
    addBot(difficulty);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-white/15 px-4 py-2.5 text-sm text-white/50 transition-all hover:border-white/30 hover:text-white/70 hover:bg-white/5 cursor-pointer"
      >
        <Plus size={14} />
        <Bot size={14} />
        <span>添加人机</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full rounded-xl bg-card/95 backdrop-blur-sm border border-white/10 p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100">
          {DIFFICULTY_LIST.map((d) => (
            <button
              key={d.value}
              onClick={() => handleAdd(d.value)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/8 cursor-pointer transition-colors group"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                style={{ background: d.avatarBg }}
              >
                <Bot size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground font-medium">{d.label}</div>
                <div className="text-xs text-muted-foreground">{d.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

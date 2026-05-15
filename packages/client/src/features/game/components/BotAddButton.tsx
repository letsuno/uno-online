import { useState } from 'react';
import type { BotDifficulty } from '@uno-online/shared';
import { useBotManagement } from '../hooks/useBotManagement';
import { DIFFICULTY_LIST } from '../constants/bot-difficulty';

export function BotAddButton() {
  const [open, setOpen] = useState(false);
  const { addBot } = useBotManagement();

  const handleAdd = (difficulty: BotDifficulty) => {
    addBot(difficulty);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full rounded-lg border-2 border-dashed border-white/20 px-4 py-2 text-sm text-white/60 transition hover:border-white/40 hover:text-white/80"
      >
        + 添加人机
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg bg-gray-800 p-1 shadow-lg">
          {DIFFICULTY_LIST.map((d) => (
            <button
              key={d.value}
              onClick={() => handleAdd(d.value)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-700"
            >
              <span className={d.color}>●</span>
              <span className="text-white">{d.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

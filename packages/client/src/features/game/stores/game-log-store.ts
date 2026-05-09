import { create } from 'zustand';
import type { Card } from '@uno-online/shared';

export type GameLogEntryType = 'play_skip' | 'play_reverse' | 'play_draw_two' | 'play_wild' | 'play_wild_draw_four' | 'play_number' | 'catch_uno' | 'challenge' | 'draw' | 'round_separator';

export interface GameLogEntry {
  id: string;
  timestamp: number;
  type: GameLogEntryType;
  playerId: string;
  playerName: string;
  targetId?: string;
  targetName?: string;
  card?: Card;
  extra?: string;
  count?: number;
  roundNumber?: number;
}

let entryId = 0;

export const useGameLogStore = create<{
  entries: GameLogEntry[];
  addEntry: (entry: Omit<GameLogEntry, 'id' | 'timestamp'>) => void;
  addRoundSeparator: (roundNumber: number) => void;
  clear: () => void;
}>((set) => ({
  entries: [],
  addEntry: (entry) => set((state) => ({
    entries: (() => {
      const timestamp = Date.now();
      const last = state.entries[state.entries.length - 1];
      if (entry.type === 'draw' && last?.type === 'draw' && last.playerId === entry.playerId) {
        return [
          ...state.entries.slice(0, -1),
          { ...last, count: (last.count ?? 1) + (entry.count ?? 1), timestamp },
        ].slice(-100);
      }

      return [...state.entries.slice(-99), { ...entry, count: entry.count ?? 1, id: `log_${++entryId}`, timestamp }];
    })(),
  })),
  addRoundSeparator: (roundNumber) => set((state) => ({
    entries: [...state.entries, {
      id: `log_${++entryId}`,
      timestamp: Date.now(),
      type: 'round_separator',
      playerId: '',
      playerName: '',
      roundNumber,
    }],
  })),
  clear: () => set({ entries: [] }),
}));

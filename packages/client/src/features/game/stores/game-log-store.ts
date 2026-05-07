import { create } from 'zustand';
import type { Card } from '@uno-online/shared';

export interface GameLogEntry {
  id: string;
  timestamp: number;
  type: 'play_skip' | 'play_reverse' | 'play_draw_two' | 'play_wild' | 'play_wild_draw_four' | 'play_number' | 'catch_uno' | 'challenge' | 'draw';
  playerId: string;
  playerName: string;
  targetId?: string;
  targetName?: string;
  card?: Card;
  extra?: string;
}

let entryId = 0;

export const useGameLogStore = create<{
  entries: GameLogEntry[];
  addEntry: (entry: Omit<GameLogEntry, 'id' | 'timestamp'>) => void;
  clear: () => void;
}>((set) => ({
  entries: [],
  addEntry: (entry) => set((state) => ({
    entries: [...state.entries.slice(-99), { ...entry, id: `log_${++entryId}`, timestamp: Date.now() }],
  })),
  clear: () => set({ entries: [] }),
}));

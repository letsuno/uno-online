import { create } from 'zustand';

// Snapshot-only — incremental updates would drift from the server's list.
interface SpectatorState {
  spectators: string[];
  pendingJoinQueue: string[];
  setSpectators: (list: string[]) => void;
  setPendingJoinQueue: (list: string[]) => void;
  clearSpectators: () => void;
}

export const useSpectatorStore = create<SpectatorState>((set) => ({
  spectators: [],
  pendingJoinQueue: [],
  setSpectators: (list) => set({ spectators: list }),
  setPendingJoinQueue: (list) => set({ pendingJoinQueue: list }),
  clearSpectators: () => set({ spectators: [], pendingJoinQueue: [] }),
}));

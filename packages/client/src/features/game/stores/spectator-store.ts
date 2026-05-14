import { create } from 'zustand';

// Populated only via full snapshots from the server's spectator events.
// No incremental add/remove — those would drift from the authoritative state.
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

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
  setSpectators: (list) =>
    set((s) => {
      // Skip the update when the server snapshot matches what we already
      // have — startNextRound rebroadcasts the list every round as a
      // defense-in-depth resync, and we don't want consumers to re-render
      // when nothing actually changed.
      if (s.spectators.length === list.length && s.spectators.every((n, i) => n === list[i])) return s;
      return { spectators: list };
    }),
  setPendingJoinQueue: (list) => set({ pendingJoinQueue: list }),
  clearSpectators: () => set({ spectators: [], pendingJoinQueue: [] }),
}));

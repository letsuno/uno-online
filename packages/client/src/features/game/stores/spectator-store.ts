import { create } from 'zustand';

interface SpectatorState {
  spectators: string[];
  pendingJoinQueue: string[];
  // The list is always populated from server-side full snapshots
  // (room:spectator_list / room:spectator_joined / room:spectator_left, all
  // of which carry the full `spectators` array). Incremental add/remove
  // helpers used to exist as a fallback when the server omitted the array;
  // they were removed once the server contract was made airtight, since a
  // local-only mutation can drift from the authoritative server state.
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

import { create } from 'zustand';
import type { SpectatorInfo, SpectatorQueueEntry } from '@uno-online/shared';

// Snapshot-only — incremental updates would drift from the server's list.
// In-game semantics only: during the waiting phase the server's spectator
// list means "unseated members", so this store must never feed waiting-room
// UI (that reads room-store). Every entry into a game (game:start, rejoin,
// reconnect) re-broadcasts an authoritative snapshot; game:back_to_room clears.
interface SpectatorState {
  spectators: SpectatorInfo[];
  pendingJoinQueue: SpectatorQueueEntry[];
  setSpectators: (list: SpectatorInfo[]) => void;
  setPendingJoinQueue: (list: SpectatorQueueEntry[]) => void;
  clearSpectators: () => void;
}

export const useSpectatorStore = create<SpectatorState>(set => ({
  spectators: [],
  pendingJoinQueue: [],
  setSpectators: list => set({ spectators: list }),
  setPendingJoinQueue: list => set({ pendingJoinQueue: list }),
  clearSpectators: () => set({ spectators: [], pendingJoinQueue: [] }),
}));

import { create } from 'zustand';

export interface SpectatorInfo {
  nickname: string;
  avatarUrl?: string | null;
}

// Snapshot-only — incremental updates would drift from the server's list.
interface SpectatorState {
  spectators: SpectatorInfo[];
  pendingJoinQueue: string[];
  setSpectators: (list: SpectatorInfo[]) => void;
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

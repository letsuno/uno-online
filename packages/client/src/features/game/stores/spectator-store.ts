import { create } from 'zustand';

interface SpectatorState {
  spectators: string[];
  pendingJoinQueue: string[];
  setSpectators: (list: string[]) => void;
  addSpectator: (nickname: string) => void;
  removeSpectator: (nickname: string) => void;
  setPendingJoinQueue: (list: string[]) => void;
  clearSpectators: () => void;
}

export const useSpectatorStore = create<SpectatorState>((set) => ({
  spectators: [],
  pendingJoinQueue: [],
  setSpectators: (list) => set({ spectators: list }),
  addSpectator: (nickname) =>
    set((s) => s.spectators.includes(nickname) ? s : { spectators: [...s.spectators, nickname] }),
  removeSpectator: (nickname) =>
    set((s) => ({ spectators: s.spectators.filter((n) => n !== nickname) })),
  setPendingJoinQueue: (list) => set({ pendingJoinQueue: list }),
  clearSpectators: () => set({ spectators: [], pendingJoinQueue: [] }),
}));

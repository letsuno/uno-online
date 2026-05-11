import { create } from 'zustand';

interface SpectatorState {
  spectators: string[];
  setSpectators: (list: string[]) => void;
  addSpectator: (nickname: string) => void;
  removeSpectator: (nickname: string) => void;
  clearSpectators: () => void;
}

export const useSpectatorStore = create<SpectatorState>((set) => ({
  spectators: [],
  setSpectators: (list) => set({ spectators: list }),
  addSpectator: (nickname) =>
    set((s) => s.spectators.includes(nickname) ? s : { spectators: [...s.spectators, nickname] }),
  removeSpectator: (nickname) =>
    set((s) => ({ spectators: s.spectators.filter((n) => n !== nickname) })),
  clearSpectators: () => set({ spectators: [] }),
}));

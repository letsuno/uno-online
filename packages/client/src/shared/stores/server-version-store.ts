import { create } from 'zustand';

interface ServerVersionState {
  initialVersion: string | null;
  needsRefresh: boolean;
  setVersion: (version: string) => void;
  dismiss: () => void;
}

export const useServerVersionStore = create<ServerVersionState>((set, get) => ({
  initialVersion: null,
  needsRefresh: false,
  setVersion: (version) => {
    const { initialVersion } = get();
    if (!initialVersion) {
      set({ initialVersion: version });
    } else if (version !== initialVersion) {
      set({ needsRefresh: true });
    }
  },
  dismiss: () => set({ needsRefresh: false }),
}));

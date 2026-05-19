import { create } from 'zustand';

interface ServerVersionState {
  initialServerVersion: string | null;
  initialClientVersion: string | null;
  needsRefresh: boolean;
  setServerVersion: (version: string) => void;
  setClientVersion: (version: string) => void;
  dismiss: () => void;
}

export const useServerVersionStore = create<ServerVersionState>((set, get) => ({
  initialServerVersion: null,
  initialClientVersion: null,
  needsRefresh: false,
  setServerVersion: (version) => {
    const { initialServerVersion } = get();
    if (!initialServerVersion) {
      set({ initialServerVersion: version });
    } else if (version !== initialServerVersion) {
      set({ needsRefresh: true });
    }
  },
  setClientVersion: (version) => {
    const { initialClientVersion } = get();
    if (!initialClientVersion) {
      set({ initialClientVersion: version });
    } else if (version !== initialClientVersion) {
      set({ needsRefresh: true });
    }
  },
  dismiss: () => set({ needsRefresh: false }),
}));

import { create } from 'zustand';
import { PROTOCOL_VERSION } from '@uno-online/shared';

interface ServerVersionState {
  initialClientVersion: string | null;
  needsRefresh: boolean;
  setServerProtocolVersion: (version: number) => void;
  setClientVersion: (version: string) => void;
  markNeedsRefresh: () => void;
}

export const useServerVersionStore = create<ServerVersionState>((set, get) => ({
  initialClientVersion: null,
  needsRefresh: false,
  setServerProtocolVersion: version => {
    if (version !== PROTOCOL_VERSION) set({ needsRefresh: true });
  },
  setClientVersion: version => {
    const { initialClientVersion } = get();
    if (!initialClientVersion) {
      set({ initialClientVersion: version });
    } else if (version !== initialClientVersion) {
      set({ needsRefresh: true });
    }
  },
  markNeedsRefresh: () => set({ needsRefresh: true }),
}));

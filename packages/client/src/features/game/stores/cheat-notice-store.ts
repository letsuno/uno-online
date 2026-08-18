import { create } from 'zustand';

interface CheatNoticeState {
  visible: boolean;
  show: () => void;
  dismiss: () => void;
}

export const useCheatNoticeStore = create<CheatNoticeState>(set => ({
  visible: false,
  show: () => set({ visible: true }),
  dismiss: () => set({ visible: false }),
}));

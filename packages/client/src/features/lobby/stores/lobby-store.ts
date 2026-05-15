import { create } from 'zustand';
import type { ActiveRoomInfo } from '@uno-online/shared';

interface LobbyState {
  activeRooms: ActiveRoomInfo[];
  setActiveRooms: (rooms: ActiveRoomInfo[]) => void;
}

export const useLobbyStore = create<LobbyState>((set) => ({
  activeRooms: [],
  setActiveRooms: (rooms) => set({ activeRooms: rooms }),
}));

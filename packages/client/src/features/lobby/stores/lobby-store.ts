import { create } from 'zustand';
import { apiGet } from '@/shared/api';

interface ActiveRoom {
  roomCode: string;
  players: { nickname: string; avatarUrl?: string | null }[];
  playerCount: number;
  startedAt: string;
  spectatorCount: number;
  spectatorMode: 'full' | 'hidden';
}

interface LobbyState {
  activeRooms: ActiveRoom[];
  loadingRooms: boolean;
  fetchActiveRooms: () => Promise<void>;
}

export const useLobbyStore = create<LobbyState>((set) => ({
  activeRooms: [],
  loadingRooms: false,
  fetchActiveRooms: async () => {
    set({ loadingRooms: true });
    try {
      const rooms = await apiGet<ActiveRoom[]>('/rooms/active');
      set({ activeRooms: rooms });
    } catch {
      set({ activeRooms: [] });
    } finally {
      set({ loadingRooms: false });
    }
  },
}));

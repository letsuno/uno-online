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

interface GameListPlayer {
  userId: string;
  nickname: string;
  placement: number;
  finalScore: number;
}

interface GameListItem {
  id: string;
  roomCode: string;
  players: GameListPlayer[];
  winnerId: string;
  winnerName: string;
  playerCount: number;
  rounds: number;
  duration: number;
  deckHash: string;
  createdAt: string;
}

interface LobbyState {
  activeRooms: ActiveRoom[];
  recentGames: GameListItem[];
  loadingRooms: boolean;
  loadingGames: boolean;
  fetchActiveRooms: () => Promise<void>;
  fetchRecentGames: () => Promise<void>;
}

export const useLobbyStore = create<LobbyState>((set) => ({
  activeRooms: [],
  recentGames: [],
  loadingRooms: false,
  loadingGames: false,
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
  fetchRecentGames: async () => {
    set({ loadingGames: true });
    try {
      const result = await apiGet<{ games: GameListItem[] }>('/games?limit=10');
      set({ recentGames: result.games });
    } catch {
      set({ recentGames: [] });
    } finally {
      set({ loadingGames: false });
    }
  },
}));

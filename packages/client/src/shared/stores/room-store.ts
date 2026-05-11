import { create } from 'zustand';
import type { RoomSettings } from '@uno-online/shared';

export interface RoomPlayer {
  userId: string;
  nickname: string;
  avatarUrl?: string | null;
  ready: boolean;
  role?: string;
  isBot?: boolean;
}

export interface RoomData {
  ownerId: string;
  status: string;
  settings: RoomSettings;
}

interface RoomState {
  roomCode: string | null;
  players: RoomPlayer[];
  room: RoomData | null;
  setRoom: (roomCode: string, players: RoomPlayer[], room: RoomData | null) => void;
  updateRoom: (data: { players?: RoomPlayer[]; room?: RoomData }) => void;
  clearRoom: () => void;
}

function dedup(players: RoomPlayer[]): RoomPlayer[] {
  const seen = new Set<string>();
  return players.filter((p) => {
    if (seen.has(p.userId)) return false;
    seen.add(p.userId);
    return true;
  });
}

export const useRoomStore = create<RoomState>((set) => ({
  roomCode: sessionStorage.getItem('roomCode'),
  players: [],
  room: null,
  setRoom: (roomCode, players, room) => {
    sessionStorage.setItem('roomCode', roomCode);
    set({ roomCode, players: dedup(players), room });
  },
  updateRoom: (data) => set((state) => ({
    players: dedup(data.players ?? state.players),
    room: data.room ?? state.room,
  })),
  clearRoom: () => {
    sessionStorage.removeItem('roomCode');
    set({ roomCode: null, players: [], room: null });
  },
}));

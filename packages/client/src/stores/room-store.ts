import { create } from 'zustand';
import type { RoomSettings } from '@uno-online/shared';

interface RoomPlayer {
  userId: string;
  username: string;
  ready: boolean;
}

interface RoomData {
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

export const useRoomStore = create<RoomState>((set) => ({
  roomCode: null,
  players: [],
  room: null,
  setRoom: (roomCode, players, room) => set({ roomCode, players, room }),
  updateRoom: (data) => set((state) => ({
    players: data.players ?? state.players,
    room: data.room ?? state.room,
  })),
  clearRoom: () => set({ roomCode: null, players: [], room: null }),
}));

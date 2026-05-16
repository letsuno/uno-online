import { create } from 'zustand';
import type { RoomSeatPlayer, RoomSpectator, RoomSeats } from '@uno-online/shared';
import { SEAT_COUNT } from '@uno-online/shared';

export type { RoomSeatPlayer, RoomSpectator, RoomSeats };
export type RoomPlayer = RoomSeatPlayer;

interface RoomData {
  ownerId: string;
  status: string;
  settings: Record<string, unknown>;
}

interface RoomState {
  roomCode: string | null;
  seats: RoomSeats;
  spectators: RoomSpectator[];
  room: RoomData | null;
  setRoom: (roomCode: string, seats: RoomSeats, spectators: RoomSpectator[], room: RoomData) => void;
  updateSeats: (data: { seats: RoomSeats; spectators: RoomSpectator[] }) => void;
  updateRoom: (data: { room?: RoomData }) => void;
  clearRoom: () => void;
}

function emptySeats(): RoomSeats {
  return Array.from({ length: SEAT_COUNT }, () => null);
}

export const useRoomStore = create<RoomState>((set) => ({
  roomCode: null,
  seats: emptySeats(),
  spectators: [],
  room: null,
  setRoom: (roomCode, seats, spectators, room) => {
    localStorage.setItem('lastRoomCode', roomCode);
    set({ roomCode, seats, spectators, room: room as RoomData });
  },
  updateSeats: (data) => set({ seats: data.seats, spectators: data.spectators }),
  updateRoom: (data) => set((state) => ({
    room: data.room ? data.room as RoomData : state.room,
  })),
  clearRoom: () => {
    localStorage.removeItem('lastRoomCode');
    set({ roomCode: null, seats: emptySeats(), spectators: [], room: null });
  },
}));

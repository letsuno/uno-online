import { create } from 'zustand';
import type { RoomData, RoomSeatPlayer, RoomSpectator, RoomSeats } from '@uno-online/shared';
import { SEAT_COUNT } from '@uno-online/shared';

export type { RoomSeatPlayer, RoomSeats };

interface RoomState {
  roomCode: string | null;
  seats: RoomSeats;
  spectators: RoomSpectator[];
  room: RoomData | null;
  setRoom: (roomCode: string, seats: RoomSeats, spectators: RoomSpectator[], room: RoomData) => void;
  updateSeats: (data: { seats: RoomSeats; spectators: RoomSpectator[] }) => void;
  updateRoom: (data: { room: RoomData }) => void;
  clearRoom: () => void;
}

function emptySeats(): RoomSeats {
  return Array.from({ length: SEAT_COUNT }, () => null);
}

export const useRoomStore = create<RoomState>(set => ({
  roomCode: null,
  seats: emptySeats(),
  spectators: [],
  room: null,
  setRoom: (roomCode, seats, spectators, room) => set({ roomCode, seats, spectators, room }),
  updateSeats: data => set({ seats: data.seats, spectators: data.spectators }),
  updateRoom: data => set({ room: data.room }),
  clearRoom: () => set({ roomCode: null, seats: emptySeats(), spectators: [], room: null }),
}));

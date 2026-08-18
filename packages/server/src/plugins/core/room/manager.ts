import type { KvStore } from '../../../kv/types.js';
import type { RoomSettings, UserRole } from '@uno-online/shared';
import { ROOM_CODE_LENGTH, ROOM_CODE_CHARS } from '@uno-online/shared';
import {
  createRoom,
  deleteRoom,
  getRoom,
  getRoomSeats,
  takeSeat,
  setSeatPlayerReady,
  getSeatedPlayers,
} from './store.js';
import type { RoomSeatPlayer } from './store.js';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export class RoomManager {
  constructor(private redis: KvStore) {}

  async createRoom(
    ownerId: string,
    ownerNickname: string,
    settings: RoomSettings,
    avatarUrl: string | null,
    role: UserRole,
  ): Promise<string> {
    let code = generateRoomCode();
    let existing = await getRoom(this.redis, code);
    while (existing) {
      code = generateRoomCode();
      existing = await getRoom(this.redis, code);
    }
    await createRoom(this.redis, code, ownerId, settings);
    const player: RoomSeatPlayer = {
      userId: ownerId,
      nickname: ownerNickname,
      avatarUrl,
      ready: false,
      connected: true,
      role,
      isBot: false,
    };
    try {
      await takeSeat(this.redis, code, 0, player);
    } catch (error) {
      // The room hash is only a reservation until its owner seat exists.
      // Never leave a discoverable room that has no authoritative member.
      await deleteRoom(this.redis, code);
      throw error;
    }
    return code;
  }

  async setReady(roomCode: string, userId: string, ready: boolean): Promise<void> {
    await setSeatPlayerReady(this.redis, roomCode, userId, ready);
  }

  async areAllReady(roomCode: string): Promise<boolean> {
    const seats = await getRoomSeats(this.redis, roomCode);
    const seated = getSeatedPlayers(seats);
    if (seated.length < 2) return false;
    return seated.every(p => p.ready);
  }
}

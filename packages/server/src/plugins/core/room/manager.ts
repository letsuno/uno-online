import type { KvStore } from '../../../kv/types.js';
import type { RoomSettings } from '@uno-online/shared';
import { SEAT_COUNT, ROOM_CODE_LENGTH, ROOM_CODE_CHARS, DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import {
  createRoom, getRoom, deleteRoom,
  getRoomSeats, takeSeat, clearSeatByUserId, setSeatPlayerReady,
  resetAllSeatsReady, setRoomOwner, getSeatedPlayers, getFirstEmptySeatIndex,
  getRoomSpectators, addSpectatorToRoom, removeSpectatorFromRoom,
} from './store.js';
import type { RoomSeatPlayer, RoomSpectator } from './store.js';

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
    ownerId: string, ownerNickname: string,
    settings: RoomSettings = { turnTimeLimit: 30, targetScore: 1000, houseRules: DEFAULT_HOUSE_RULES, allowSpectators: true, spectatorMode: 'hidden' },
    avatarUrl?: string | null, role?: string, _isBot?: boolean,
  ): Promise<string> {
    let code = generateRoomCode();
    let existing = await getRoom(this.redis, code);
    while (existing) {
      code = generateRoomCode();
      existing = await getRoom(this.redis, code);
    }
    await createRoom(this.redis, code, ownerId, settings);
    const player: RoomSeatPlayer = {
      userId: ownerId, nickname: ownerNickname,
      avatarUrl: avatarUrl ?? null, ready: false, connected: true,
      role: role ?? 'normal', isBot: false,
    };
    await takeSeat(this.redis, code, 0, player);
    return code;
  }

  async joinRoom(
    roomCode: string, userId: string, nickname: string,
    avatarUrl?: string | null, role?: string, _isBot?: boolean,
  ): Promise<void> {
    const room = await getRoom(this.redis, roomCode);
    if (!room) throw new Error('Room not found');
    if (room.status !== 'waiting') throw new Error('Game already in progress');
    const seats = await getRoomSeats(this.redis, roomCode);
    const spectators = await getRoomSpectators(this.redis, roomCode);
    const alreadySeated = seats.some(s => s !== null && s.userId === userId);
    const alreadySpectating = spectators.some(s => s.userId === userId);
    if (alreadySeated || alreadySpectating) throw new Error('Already in room');
    const spectator: RoomSpectator = {
      userId, nickname, avatarUrl: avatarUrl ?? null, role: role ?? 'normal',
    };
    await addSpectatorToRoom(this.redis, roomCode, spectator);
  }

  async leaveRoom(roomCode: string, userId: string): Promise<{ deleted: boolean }> {
    await clearSeatByUserId(this.redis, roomCode, userId);
    await removeSpectatorFromRoom(this.redis, roomCode, userId);
    const seats = await getRoomSeats(this.redis, roomCode);
    const spectators = await getRoomSpectators(this.redis, roomCode);
    const seatedPlayers = getSeatedPlayers(seats);
    const allParticipants = [...seatedPlayers, ...spectators];
    const hasHumans = allParticipants.some(p => !('isBot' in p && p.isBot));
    if (allParticipants.length === 0 || !hasHumans) {
      await deleteRoom(this.redis, roomCode);
      return { deleted: true };
    }
    const room = await getRoom(this.redis, roomCode);
    if (room && room.ownerId === userId) {
      const nextOwner = seatedPlayers.find(p => !p.isBot) ?? spectators[0];
      if (nextOwner) {
        await setRoomOwner(this.redis, roomCode, nextOwner.userId);
      }
    }
    return { deleted: false };
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

  async resetReady(roomCode: string): Promise<void> {
    await resetAllSeatsReady(this.redis, roomCode);
  }
}

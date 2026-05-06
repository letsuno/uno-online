import type { KvStore } from '../kv/types.js';
import type { RoomSettings } from '@uno-online/shared';
import { MAX_PLAYERS, ROOM_CODE_LENGTH, ROOM_CODE_CHARS, DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import {
  createRoom, getRoom, addPlayerToRoom, removePlayerFromRoom,
  getRoomPlayers, setPlayerReady, setRoomOwner, deleteRoom,
} from './room-store.js';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export class RoomManager {
  constructor(private redis: KvStore) {}

  async createRoom(ownerId: string, ownerName: string, settings: RoomSettings = { turnTimeLimit: 30, targetScore: 500, houseRules: DEFAULT_HOUSE_RULES }): Promise<string> {
    let code = generateRoomCode();
    let existing = await getRoom(this.redis, code);
    while (existing) {
      code = generateRoomCode();
      existing = await getRoom(this.redis, code);
    }
    await createRoom(this.redis, code, ownerId, settings);
    await addPlayerToRoom(this.redis, code, { userId: ownerId, username: ownerName });
    return code;
  }

  async joinRoom(roomCode: string, userId: string, username: string): Promise<void> {
    const room = await getRoom(this.redis, roomCode);
    if (!room) throw new Error('Room not found');
    if (room.status !== 'waiting') throw new Error('Game already in progress');
    const players = await getRoomPlayers(this.redis, roomCode);
    if (players.some((p) => p.userId === userId)) throw new Error('Already in room');
    if (players.length >= MAX_PLAYERS) throw new Error('Room is full');
    await addPlayerToRoom(this.redis, roomCode, { userId, username });
  }

  async leaveRoom(roomCode: string, userId: string): Promise<{ deleted: boolean }> {
    await removePlayerFromRoom(this.redis, roomCode, userId);
    const players = await getRoomPlayers(this.redis, roomCode);
    if (players.length === 0) {
      await deleteRoom(this.redis, roomCode);
      return { deleted: true };
    }
    const room = await getRoom(this.redis, roomCode);
    if (room && room.ownerId === userId) {
      await setRoomOwner(this.redis, roomCode, players[0]!.userId);
    }
    return { deleted: false };
  }

  async setReady(roomCode: string, userId: string, ready: boolean): Promise<void> {
    await setPlayerReady(this.redis, roomCode, userId, ready);
  }

  async areAllReady(roomCode: string): Promise<boolean> {
    const players = await getRoomPlayers(this.redis, roomCode);
    if (players.length < 2) return false;
    return players.every((p) => p.ready);
  }
}

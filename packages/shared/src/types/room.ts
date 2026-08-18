import type { BotConfig } from './bot.js';
import type { RoomSettings } from './game.js';
import type { UserRole } from './role.js';

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomData {
  ownerId: string;
  status: RoomStatus;
  settings: RoomSettings;
  createdAt: string;
  lastActivityAt: string;
}

export interface RoomSeatPlayer {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  ready: boolean;
  connected: boolean;
  role: UserRole;
  isBot: boolean;
  botConfig?: BotConfig;
}

export type RoomSeats = (RoomSeatPlayer | null)[];

export interface RoomSpectator {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  role: UserRole;
  connected: boolean;
}

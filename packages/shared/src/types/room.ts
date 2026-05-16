import type { BotConfig } from './bot.js';

export interface RoomSeatPlayer {
  userId: string;
  nickname: string;
  avatarUrl?: string | null;
  ready: boolean;
  connected: boolean;
  role?: string;
  isBot: boolean;
  botConfig?: BotConfig;
}

export type RoomSeats = (RoomSeatPlayer | null)[];

export interface RoomSpectator {
  userId: string;
  nickname: string;
  avatarUrl?: string | null;
  role?: string;
  connected: boolean;
  disconnectedAt?: number;
}

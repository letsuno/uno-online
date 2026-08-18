import type { RoomData, RoomSeats, RoomSettingsPatch, RoomSpectator } from '@uno-online/shared';

export interface McpConfig {
  apiKey: string;
  serverUrl: string;
  mode: 'stdio' | 'http';
  httpPort: number;
}

export type McpRoomInfo =
  | {
      membership: 'active';
      roomCode: string;
      room: RoomData;
      seats: RoomSeats;
      spectators: RoomSpectator[];
      voiceChannelId: number | null;
    }
  | { membership: 'suspended'; roomCode: string }
  | { membership: 'unknown' };

export type McpRoomSettingsInput = RoomSettingsPatch;

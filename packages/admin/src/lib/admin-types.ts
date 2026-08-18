import type { BotDifficulty, GamePhase, RoomSettings, RoomStatus, UserRole } from '@uno-online/shared';

export interface AdminRoomPlayer {
  seatIndex: number;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  role: UserRole;
  ready: boolean;
  connected: boolean;
  isBot: boolean;
  botDifficulty: BotDifficulty | null;
  aiProviderId: string | null;
}

export interface AdminRoomSpectator {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  role: UserRole;
  connected: boolean;
}

export interface AdminRoom {
  code: string;
  ownerId: string;
  ownerNickname: string | null;
  status: RoomStatus;
  players: AdminRoomPlayer[];
  spectators: AdminRoomSpectator[];
  connectedPlayerCount: number;
  botCount: number;
  connectedSpectatorCount: number;
  settings: RoomSettings;
  game: {
    phase: GamePhase;
    roundNumber: number;
    currentPlayerId: string | null;
    currentPlayerName: string | null;
    startedAt: number | null;
  } | null;
  createdAt: string;
  lastActivityAt: string;
}

export interface AdminUser {
  id: string;
  username: string;
  nickname: string;
  role: UserRole;
  avatarUrl: string | null;
  hasPassword: boolean;
  hasGithub: boolean;
  passkeyCount: number;
  apiKeyCount: number;
  lastApiKeyUsedAt: string | null;
  online: boolean;
  connectionCount: number;
  currentRoomCode: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface UsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface DashboardData {
  generatedAt: string;
  server: {
    name: string;
    motd: string;
    version: string;
    protocolVersion: number;
    runtimeSchemaVersion: string;
    environment: 'development' | 'production';
    onlineConnections: number;
    uptimeSeconds: number;
    nodeVersion: string;
    memory: {
      rssBytes: number;
      heapUsedBytes: number;
    };
  };
  totals: {
    users: number;
    rooms: number;
    waitingRooms: number;
    playingRooms: number;
    finishedRooms: number;
    connectedPlayers: number;
    bots: number;
    spectators: number;
    connectedSpectators: number;
    apiKeys: number;
    passkeys: number;
  };
  accounts: {
    passwordUsers: number;
    githubUsers: number;
    roleCounts: Record<UserRole, number>;
  };
  ai: {
    providers: number;
    enabledProviders: number;
    loadFailures: number;
  };
  recentUsers: Array<{
    id: string;
    username: string;
    nickname: string;
    role: UserRole;
    avatarUrl: string | null;
    createdAt: string;
  }>;
  recentRooms: Array<{
    code: string;
    status: RoomStatus;
    ownerNickname: string | null;
    playerCount: number;
    connectedPlayerCount: number;
    spectatorCount: number;
    lastActivityAt: string;
  }>;
}

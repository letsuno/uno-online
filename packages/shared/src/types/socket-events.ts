import type { Card, Color } from './card.js';
import type { PlayerView } from './player-view.js';
import type { ChatMessage } from './chat.js';
import type { DrawSide, RoomSettingsPatch } from './game.js';
import type { BotSelection, RuleBotDifficulty } from './bot.js';
import type { RoomData, RoomSeats, RoomSpectator } from './room.js';

export type SocketResult<T extends object = Record<never, never>> =
  ({ success: true } & T) | { success: false; error: string };

export type SocketCallbackResult = SocketResult;

export type RoomLeaveResult = SocketResult<{
  outcome: 'left' | 'dissolved' | 'suspended';
}>;

export type BackToRoomResult = SocketResult<{
  seats: RoomSeats;
  spectators: RoomSpectator[];
  room: RoomData;
}>;

export interface AiProviderInfo {
  id: string;
  displayName: string;
  fairness: 'fair' | 'privileged' | 'cheat';
}

export type AiProviderListResult = SocketResult<{ providers: AiProviderInfo[] }>;

export type RoomCreateResult = SocketResult<{
  roomCode: string;
  room: RoomData;
  seats: RoomSeats;
  spectators: RoomSpectator[];
  voiceChannelId: number | null;
}>;

export type RoomJoinResult = SocketResult<{
  room: RoomData;
  seats: RoomSeats;
  spectators: RoomSpectator[];
  rejoin: boolean;
  voiceChannelId: number | null;
}>;

type RoomRejoinSuccessBase = {
  room: RoomData;
  seats: RoomSeats;
  spectators: RoomSpectator[];
};

export type RoomRejoinResult =
  | ({ success: true; mode: 'waiting' } & RoomRejoinSuccessBase)
  | ({ success: true; mode: 'player' | 'spectator'; gameState: PlayerView } & RoomRejoinSuccessBase)
  | { success: false; error: string };

export interface ActiveRoomInfo {
  roomCode: string;
  players: { nickname: string; avatarUrl: string | null }[];
  playerCount: number;
  gameStartedAt: number;
  spectatorCount: number;
  spectatorMode: 'full' | 'hidden';
}

export type RoomMembershipEndReason = 'kicked' | 'host_closed' | 'idle_timeout' | 'empty' | 'cheat_detected';
export type RoomDissolveReason = Exclude<RoomMembershipEndReason, 'kicked'>;

export interface VoicePresence {
  inVoice: boolean;
  micEnabled: boolean;
  speakerMuted: boolean;
  speaking: boolean;
  forceMuted: boolean;
}

export interface SpectatorQueueEntry {
  userId: string;
  nickname: string;
}

export interface SpectatorInfo {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  connected: boolean;
}

export interface ServerToClientEvents {
  'lobby:rooms': (rooms: ActiveRoomInfo[]) => void;
  'game:state': (view: PlayerView) => void;
  'game:update': (view: PlayerView) => void;
  'game:card_drawn': (data: { card: Card }) => void;
  'game:next_round_vote': (data: { votes: number; required: number; voters: string[] }) => void;
  'game:over': (data: {
    winnerId: string | null;
    scores: Record<string, number>;
    reason?: string;
    gameOverAt: number;
  }) => void;
  'game:back_to_room': (data: { seats: RoomSeats; spectators: RoomSpectator[]; room: RoomData }) => void;
  'game:round_end': (data: { winnerId: string | null; scores: Record<string, number>; roundEndAt: number }) => void;
  'auth:kicked': (data: { reason: string }) => void;
  'player:timeout': (data: { playerId: string }) => void;
  'player:disconnected': (data: { playerId: string }) => void;
  'player:reconnected': (data: { playerId: string }) => void;
  'player:autopilot': (data: { playerId: string; enabled: boolean }) => void;
  'chat:message': (message: ChatMessage) => void;
  'chat:history': (messages: ChatMessage[]) => void;
  'chat:cleared': () => void;
  'chat:rate_limited': (data: { message: string }) => void;
  'throw:item': (data: { fromId: string; targetId: string; item: string }) => void;
  'room:updated': (data: { room: RoomData }) => void;
  'room:ready_changed': (data: { playerId: string; ready: boolean }) => void;
  'room:membership_ended': (data: { roomCode: string; reason: RoomMembershipEndReason }) => void;
  'room:moved_to_spectator': (data: { roomCode: string; reason: string }) => void;
  'room:spectator_joined': (data: { nickname: string; spectators: SpectatorInfo[] }) => void;
  'room:spectator_left': (data: { nickname: string; spectators: SpectatorInfo[] }) => void;
  'room:spectator_list': (data: { spectators: SpectatorInfo[] }) => void;
  'room:owner_transfer_pending': (data: { transferAt: number }) => void;
  'room:owner_transfer_cancelled': () => void;
  'seat:updated': (data: { seats: RoomSeats; spectators: RoomSpectator[] }) => void;
  'seat:swap_requested': (data: {
    requesterId: string;
    requesterName: string;
    requesterSeatIndex: number;
    targetSeatIndex: number;
  }) => void;
  'seat:swap_resolved': (data: {
    accepted: boolean;
    requesterId: string;
    targetUserId: string;
    reason?: 'timeout' | 'responder_left_seat' | 'responder_ready';
  }) => void;
  'game:spectator_queue': (data: { queue: SpectatorQueueEntry[] }) => void;
  'voice:presence': (presence: Record<string, VoicePresence>) => void;
  'server:version': (data: { protocolVersion: number; serverTime: number }) => void;
}

export interface ClientToServerEvents {
  'room:create': (settings: RoomSettingsPatch, callback: (res: RoomCreateResult) => void) => void;
  'room:join': (roomCode: string, callback: (res: RoomJoinResult) => void) => void;
  'room:rejoin': (roomCode: string, callback: (res: RoomRejoinResult) => void) => void;
  'room:leave': (callback?: (res: RoomLeaveResult) => void) => void;
  'room:ready': (ready: boolean, callback?: (res: SocketCallbackResult) => void) => void;
  'room:update_settings': (
    settings: RoomSettingsPatch,
    callback?: (res: SocketResult<{ room: RoomData }>) => void,
  ) => void;
  'room:dissolve': (callback?: (res: SocketCallbackResult) => void) => void;
  'room:transfer_owner': (payload: { targetId: string }, callback?: (res: SocketCallbackResult) => void) => void;
  'room:kick': (payload: { targetId: string }, callback?: (res: SocketCallbackResult) => void) => void;
  'room:add_bot': (
    payload: BotSelection & { seatIndex?: number },
    callback: (res: SocketResult<{ botId: string }>) => void,
  ) => void;
  'room:remove_bot': (payload: { botId: string }, callback: (res: SocketCallbackResult) => void) => void;
  'room:set_bot_difficulty': (
    payload: { botId: string; difficulty: RuleBotDifficulty },
    callback: (res: SocketCallbackResult) => void,
  ) => void;
  'room:set_bot_ai': (
    payload: { botId: string; providerId: string },
    callback: (res: SocketCallbackResult) => void,
  ) => void;
  'room:list_ai_providers': (
    payload: { intent: 'add' | 'switch' },
    callback: (res: AiProviderListResult) => void,
  ) => void;
  'seat:take': (seatIndex: number, callback: (res: SocketCallbackResult) => void) => void;
  'seat:leave': (callback: (res: SocketCallbackResult) => void) => void;
  'seat:swap_request': (targetUserId: string, callback: (res: SocketCallbackResult) => void) => void;
  'seat:swap_respond': (
    payload: { requesterId: string; accept: boolean },
    callback: (res: SocketCallbackResult) => void,
  ) => void;
  'voice:force_mute': (
    payload: { targetId: string; muted: boolean },
    callback?: (res: SocketCallbackResult) => void,
  ) => void;
  'game:start': (callback: (res: SocketResult<{ gameState: PlayerView }>) => void) => void;
  'game:play_card': (
    payload: { cardId: string; chosenColor?: Color },
    callback?: (res: SocketCallbackResult) => void,
  ) => void;
  'game:draw_card': (payload: { side: DrawSide }, callback?: (res: SocketCallbackResult) => void) => void;
  'game:pass': (callback?: (res: SocketCallbackResult) => void) => void;
  'game:call_uno': (callback?: (res: SocketCallbackResult) => void) => void;
  'game:catch_uno': (payload: { targetPlayerId: string }, callback?: (res: SocketCallbackResult) => void) => void;
  'game:challenge': (callback?: (res: SocketCallbackResult) => void) => void;
  'game:accept': (callback?: (res: SocketCallbackResult) => void) => void;
  'game:choose_color': (payload: { color: Color }, callback?: (res: SocketCallbackResult) => void) => void;
  'game:choose_swap_target': (payload: { targetId: string }, callback?: (res: SocketCallbackResult) => void) => void;
  'game:next_round': (
    callback?: (
      res: SocketResult<{ started: boolean; vote: { votes: number; required: number; voters: string[] } }>,
    ) => void,
  ) => void;
  'game:kick_player': (payload: { targetId: string }, callback?: (res: SocketCallbackResult) => void) => void;
  'game:back_to_room': (callback?: (res: BackToRoomResult) => void) => void;
  'chat:message': (data: { text: string }) => void;
  'voice:channel:get': (callback: (res: SocketResult<{ voiceChannelId: number | null }>) => void) => void;
  'voice:presence:get': (callback: (presence: Record<string, VoicePresence>) => void) => void;
  'voice:presence': (data: Omit<VoicePresence, 'forceMuted'>, callback?: (res: SocketCallbackResult) => void) => void;
  'throw:item': (payload: { targetId: string; item: string }, callback?: (res: SocketCallbackResult) => void) => void;
  'player:toggle-autopilot': (callback?: (res: SocketResult<{ autopilot: boolean }>) => void) => void;
  'game:spectator_join': (callback?: (res: SocketResult<{ queued: boolean }>) => void) => void;
  'game:leave_to_spectate': (callback?: (res: SocketCallbackResult) => void) => void;
  'game:autopilot_once': (callback?: (res: SocketCallbackResult) => void) => void;
  'user:current_room': (callback: (res: { roomCode: string | null }) => void) => void;
  'ping:latency': (callback: () => void) => void;
}

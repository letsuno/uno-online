import type { Card, Color } from './card';
import type { PlayerView } from './player-view';
import type { ChatMessage } from './chat';
import type { RoomSettings } from './game';

export interface SocketCallbackResult {
  success: boolean;
  error?: string;
}

export interface RoomCreateResult extends SocketCallbackResult {
  roomCode?: string;
  players?: Record<string, unknown>[];
  room?: Record<string, unknown>;
}

export interface RoomJoinResult extends SocketCallbackResult {
  room?: Record<string, unknown>;
  players?: Record<string, unknown>[];
  rejoin?: boolean;
}

export interface ServerToClientEvents {
  'game:state': (view: PlayerView) => void;
  'game:update': (view: PlayerView) => void;
  'game:card_drawn': (data: { card: Card }) => void;
  'game:action_rejected': (data: { action?: string; reason: string }) => void;
  'game:next_round_vote': (data: { votes: number; required: number; voters: string[] }) => void;
  'game:over': (data: { winnerId: string | null; scores: Record<string, number>; reason?: string }) => void;
  'game:round_end': (data: { winnerId: string | null; scores: Record<string, number> }) => void;
  'game:kicked': (data: { reason: string }) => void;
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
  'room:updated': (data: Record<string, unknown>) => void;
  'room:dissolved': (data?: { reason?: string }) => void;
  'room:rejoin_redirect': (data: { roomCode: string }) => void;
  'room:spectator_joined': (data: { nickname: string; spectators: string[] }) => void;
  'room:spectator_left': (data: { nickname: string; spectators: string[] }) => void;
  'room:spectator_list': (data: { spectators: string[] }) => void;
  'game:cheat_detected': () => void;
  'voice:presence': (presence: Record<string, unknown>) => void;
}

export interface ClientToServerEvents {
  'room:create': (settings: Partial<RoomSettings>, callback: (res: RoomCreateResult) => void) => void;
  'room:join': (roomCode: string, callback: (res: RoomJoinResult) => void) => void;
  'room:rejoin': (roomCode: string, callback: (res: SocketCallbackResult & Record<string, unknown>) => void) => void;
  'room:leave': (callback?: (res: SocketCallbackResult) => void) => void;
  'room:ready': (ready: boolean, callback?: (res: SocketCallbackResult) => void) => void;
  'room:update_settings': (settings: Partial<RoomSettings>, callback?: (res: SocketCallbackResult & { room?: Record<string, unknown> }) => void) => void;
  'room:dissolve': (callback?: (res: SocketCallbackResult) => void) => void;
  'room:spectate': (roomCode: string, callback?: (res: SocketCallbackResult) => void) => void;
  'game:start': (callback: (res: SocketCallbackResult & { gameState?: PlayerView }) => void) => void;
  'game:play_card': (payload: { cardId: string; chosenColor?: Color }, callback?: (res: SocketCallbackResult) => void) => void;
  'game:draw_card': (payload: { side?: string }, callback?: (res: SocketCallbackResult) => void) => void;
  'game:pass': (callback?: (res: SocketCallbackResult) => void) => void;
  'game:call_uno': (callback?: (res: SocketCallbackResult) => void) => void;
  'game:catch_uno': (payload: { targetPlayerId: string }, callback?: (res: SocketCallbackResult) => void) => void;
  'game:challenge': (callback?: (res: SocketCallbackResult) => void) => void;
  'game:accept': (callback?: (res: SocketCallbackResult) => void) => void;
  'game:choose_color': (payload: { color: Color }, callback?: (res: SocketCallbackResult) => void) => void;
  'game:choose_swap_target': (payload: { targetId: string }, callback?: (res: SocketCallbackResult) => void) => void;
  'game:next_round': (callback?: (res: SocketCallbackResult & { started?: boolean; vote?: { votes: number; required: number; voters: string[] } }) => void) => void;
  'game:kick_player': (payload: { targetId?: string }, callback?: (res: SocketCallbackResult) => void) => void;
  'game:rematch': (callback?: (res: SocketCallbackResult) => void) => void;
  'chat:message': (data: { text: string }) => void;
  'voice:presence:get': (callback: (presence: Record<string, unknown>) => void) => void;
  'voice:presence': (data: Record<string, unknown>, callback?: (res: SocketCallbackResult) => void) => void;
  'throw:item': (payload: { targetId: string; item: string }, callback?: (res: SocketCallbackResult) => void) => void;
  'player:toggle-autopilot': (callback?: (res: SocketCallbackResult & { autopilot?: boolean }) => void) => void;
  'game:spectator_join': (callback?: (res: SocketCallbackResult) => void) => void;
}

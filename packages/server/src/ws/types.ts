import type { ClientToServerEvents, ServerToClientEvents } from '@uno-online/shared';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import type { TokenPayload } from '../auth/jwt.js';

export interface SocketData {
  user: TokenPayload;
  roomCode: string | null;
  isSpectator: boolean;
}

export type UnoServer = Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;

export type UnoSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;

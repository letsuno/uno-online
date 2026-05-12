import type { TokenPayload } from '../auth/jwt.js';

export interface SocketData {
  user: TokenPayload;
  roomCode: string | null;
  isSpectator: boolean;
}

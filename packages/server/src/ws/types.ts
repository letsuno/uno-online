import type { TokenPayload } from '../auth/jwt';

export interface SocketData {
  user: TokenPayload;
  roomCode: string | null;
  isSpectator: boolean;
}

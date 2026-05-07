import type { Socket } from 'socket.io';
import { verifyToken } from './jwt';
import type { TokenPayload } from './jwt';

export function authenticateSocket(socket: Socket, jwtSecret: string): TokenPayload | null {
  const token = socket.handshake.auth?.['token'] as string | undefined;
  if (!token) return null;
  return verifyToken(token, jwtSecret);
}

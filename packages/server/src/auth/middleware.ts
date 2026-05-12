import type { Socket } from 'socket.io';
import { verifyToken } from './jwt.js';
import type { TokenPayload } from './jwt.js';
import { getDb } from '../db/database.js';
import { verifyApiKey } from '../plugins/core/api-key/repo.js';

export function authenticateSocket(socket: Socket, jwtSecret: string): TokenPayload | null {
  const token = socket.handshake.auth?.['token'] as string | undefined;
  if (!token) return null;
  return verifyToken(token, jwtSecret);
}

export async function authenticateSocketAsync(socket: Socket, jwtSecret: string): Promise<TokenPayload | null> {
  const token = socket.handshake.auth?.['token'] as string | undefined;
  if (!token) return null;
  if (token.startsWith('uno_ak_')) {
    const user = await verifyApiKey(getDb(), token);
    if (!user) return null;
    return { userId: user.userId, username: user.username, nickname: user.nickname, avatarUrl: user.avatarUrl, role: user.role as TokenPayload['role'], isBot: true };
  }
  return verifyToken(token, jwtSecret);
}

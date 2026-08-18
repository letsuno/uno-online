import type { Socket } from 'socket.io';
import { verifyToken } from './jwt.js';
import type { TokenPayload } from './jwt.js';
import { getDb } from '../db/database.js';
import { verifyApiKey } from '../plugins/core/api-key/repo.js';
import { isUserRole } from '@uno-online/shared';

export async function authenticateSocketAsync(socket: Socket, jwtSecret: string): Promise<TokenPayload | null> {
  const token: unknown = socket.handshake.auth?.['token'];
  if (typeof token !== 'string' || token.length === 0) return null;
  if (token.startsWith('uno_ak_')) {
    const user = await verifyApiKey(getDb(), token);
    if (!user || !isUserRole(user.role)) return null;
    return {
      userId: user.userId,
      username: user.username,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isBot: false,
    };
  }
  return verifyToken(token, jwtSecret);
}

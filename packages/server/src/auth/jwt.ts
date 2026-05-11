import jwt from 'jsonwebtoken';
import type { UserRole } from '@uno-online/shared';

export interface TokenPayload {
  userId: string;
  username: string;
  nickname: string;
  avatarUrl?: string | null;
  role: UserRole;
  isBot?: boolean;
}

export function signToken(payload: TokenPayload, secret: string, expiresIn = '7d'): string {
  return jwt.sign(payload, secret, { expiresIn: expiresIn as `${number}d` });
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret) as TokenPayload;
    return {
      userId: decoded.userId,
      username: decoded.username,
      nickname: decoded.nickname ?? decoded.username,
      avatarUrl: decoded.avatarUrl ?? null,
      role: decoded.role ?? 'normal',
    };
  } catch {
    return null;
  }
}

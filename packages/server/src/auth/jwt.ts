import jwt from 'jsonwebtoken';
import type { UserRole } from '@uno-online/shared';
import { isUserRole } from '@uno-online/shared';

export interface TokenPayload {
  userId: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  role: UserRole;
  isBot: boolean;
}

export function signToken(payload: TokenPayload, secret: string, expiresIn = '7d'): string {
  return jwt.sign(payload, secret, { expiresIn: expiresIn as `${number}d` });
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  try {
    const decoded: unknown = jwt.verify(token, secret);
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;

    const payload = decoded as Record<string, unknown>;
    if (
      typeof payload['userId'] !== 'string' ||
      payload['userId'].length === 0 ||
      typeof payload['username'] !== 'string' ||
      payload['username'].length === 0 ||
      typeof payload['nickname'] !== 'string' ||
      payload['nickname'].length === 0 ||
      !isUserRole(payload['role']) ||
      (payload['avatarUrl'] !== null && typeof payload['avatarUrl'] !== 'string') ||
      typeof payload['isBot'] !== 'boolean'
    )
      return null;

    return {
      userId: payload['userId'],
      username: payload['username'],
      nickname: payload['nickname'],
      avatarUrl: payload['avatarUrl'],
      role: payload['role'],
      isBot: payload['isBot'],
    };
  } catch {
    return null;
  }
}

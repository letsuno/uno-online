import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  username: string;
}

export function signToken(payload: TokenPayload, secret: string, expiresIn = '7d'): string {
  return jwt.sign(payload, secret, { expiresIn: expiresIn as `${number}d` });
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret) as TokenPayload;
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    return null;
  }
}

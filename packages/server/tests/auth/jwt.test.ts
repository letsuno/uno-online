import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signToken, verifyToken } from '../../src/auth/jwt';

const TEST_SECRET = 'test-secret-that-is-at-least-32-chars-long';

describe('JWT', () => {
  it('signs and verifies a token', () => {
    const payload = {
      userId: 'user-123',
      username: 'alice',
      nickname: 'Alice',
      avatarUrl: null,
      role: 'normal' as const,
      isBot: false,
    };
    const token = signToken(payload, TEST_SECRET);
    const decoded = verifyToken(token, TEST_SECRET);
    expect(decoded).toMatchObject({
      userId: 'user-123',
      username: 'alice',
      nickname: 'Alice',
      role: 'normal',
    });
  });

  it('rejects tokens missing current identity fields instead of filling defaults', () => {
    const withoutNickname = jwt.sign(
      {
        userId: 'user-123',
        username: 'alice',
        avatarUrl: null,
        role: 'normal',
        isBot: false,
      },
      TEST_SECRET,
    );
    const withoutRole = jwt.sign(
      {
        userId: 'user-123',
        username: 'alice',
        nickname: 'Alice',
        avatarUrl: null,
        isBot: false,
      },
      TEST_SECRET,
    );
    const withoutAvatar = jwt.sign(
      {
        userId: 'user-123',
        username: 'alice',
        nickname: 'Alice',
        role: 'normal',
        isBot: false,
      },
      TEST_SECRET,
    );
    const withoutBotFlag = jwt.sign(
      {
        userId: 'user-123',
        username: 'alice',
        nickname: 'Alice',
        avatarUrl: null,
        role: 'normal',
      },
      TEST_SECRET,
    );

    expect(verifyToken(withoutNickname, TEST_SECRET)).toBeNull();
    expect(verifyToken(withoutRole, TEST_SECRET)).toBeNull();
    expect(verifyToken(withoutAvatar, TEST_SECRET)).toBeNull();
    expect(verifyToken(withoutBotFlag, TEST_SECRET)).toBeNull();
  });

  it('rejects tokens with an unknown role', () => {
    const token = jwt.sign(
      {
        userId: 'user-123',
        username: 'alice',
        nickname: 'Alice',
        avatarUrl: null,
        role: 'legacy-role',
        isBot: false,
      },
      TEST_SECRET,
    );

    expect(verifyToken(token, TEST_SECRET)).toBeNull();
  });

  it('returns null for invalid token', () => {
    const decoded = verifyToken('garbage-token', TEST_SECRET);
    expect(decoded).toBeNull();
  });

  it('returns null for expired token', () => {
    const payload = {
      userId: 'user-123',
      username: 'alice',
      nickname: 'Alice',
      avatarUrl: null,
      role: 'normal' as const,
      isBot: false,
    };
    const token = signToken(payload, TEST_SECRET, '0s');
    const decoded = verifyToken(token, TEST_SECRET);
    expect(decoded).toBeNull();
  });

  it('returns null for wrong secret', () => {
    const payload = {
      userId: 'user-123',
      username: 'alice',
      nickname: 'Alice',
      avatarUrl: null,
      role: 'normal' as const,
      isBot: false,
    };
    const token = signToken(payload, TEST_SECRET);
    const decoded = verifyToken(token, 'wrong-secret-that-is-32-chars-lo');
    expect(decoded).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '../../src/auth/jwt';

const TEST_SECRET = 'test-secret-that-is-at-least-32-chars-long';

describe('JWT', () => {
  it('signs and verifies a token', () => {
    const payload = { userId: 'user-123', username: 'alice' };
    const token = signToken(payload, TEST_SECRET);
    const decoded = verifyToken(token, TEST_SECRET);
    expect(decoded.userId).toBe('user-123');
    expect(decoded.username).toBe('alice');
  });

  it('returns null for invalid token', () => {
    const decoded = verifyToken('garbage-token', TEST_SECRET);
    expect(decoded).toBeNull();
  });

  it('returns null for expired token', () => {
    const payload = { userId: 'user-123', username: 'alice' };
    const token = signToken(payload, TEST_SECRET, '0s');
    const decoded = verifyToken(token, TEST_SECRET);
    expect(decoded).toBeNull();
  });

  it('returns null for wrong secret', () => {
    const payload = { userId: 'user-123', username: 'alice' };
    const token = signToken(payload, TEST_SECRET);
    const decoded = verifyToken(token, 'wrong-secret-that-is-32-chars-lo');
    expect(decoded).toBeNull();
  });
});

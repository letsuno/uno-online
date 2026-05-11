import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyApiKey } from '../src/auth.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('verifyApiKey', () => {
  it('returns user identity for valid key', async () => {
    const mockUser = { userId: 'u1', username: 'alice', nickname: 'Alice', avatarUrl: null, role: 'normal', token: 'jwt-xxx' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockUser,
    }));
    const user = await verifyApiKey('https://server.com', 'uno_ak_test');
    expect(user).toEqual(mockUser);
    expect(fetch).toHaveBeenCalledWith('https://server.com/api/api-keys/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'uno_ak_test' }),
    });
  });

  it('throws for invalid key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: '无效的 API Key' }),
    }));
    await expect(verifyApiKey('https://server.com', 'bad')).rejects.toThrow('无效的 API Key');
  });
});

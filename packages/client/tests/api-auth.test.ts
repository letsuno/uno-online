import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  token: null as string | null,
}));

vi.mock('@/features/auth/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({ token: mocks.token }),
  },
}));

vi.mock('@/shared/env', () => ({ getApiUrl: () => '' }));

import { apiGet, UnauthorizedError } from '../src/shared/api';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

const dispatchEvent = vi.fn();

beforeEach(() => {
  mocks.token = null;
  vi.stubGlobal('localStorage', createMemoryStorage());
  vi.stubGlobal('window', { dispatchEvent });
  vi.stubGlobal('fetch', vi.fn());
  dispatchEvent.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API authentication source', () => {
  it('does not borrow a token written by another tab', async () => {
    localStorage.setItem('token', 'other-tab-token');
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await apiGet('/test');

    expect(fetch).toHaveBeenCalledWith('/api/test', { headers: {} });
  });

  it('does not erase a replacement tab token after a stale request gets 401', async () => {
    mocks.token = 'stale-tab-token';
    localStorage.setItem('token', 'replacement-tab-token');
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }));

    await expect(apiGet('/test')).rejects.toBeInstanceOf(UnauthorizedError);

    expect(localStorage.getItem('token')).toBe('replacement-tab-token');
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });

  it('removes the token that actually received 401', async () => {
    mocks.token = 'expired-token';
    localStorage.setItem('token', 'expired-token');
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }));

    await expect(apiGet('/test')).rejects.toBeInstanceOf(UnauthorizedError);

    expect(localStorage.getItem('token')).toBeNull();
  });
});

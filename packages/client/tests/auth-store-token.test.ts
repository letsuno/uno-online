import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('@/shared/api', () => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    apiGet: mocks.apiGet,
    apiPost: mocks.apiPost,
    apiDelete: vi.fn(),
  };
});
vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));
vi.mock('@/shared/session-takeover', () => ({
  isSessionTakenOver: () => false,
  resetSessionTakeover: vi.fn(),
}));
vi.mock('@/shared/stores/reset-room', () => ({ resetClientRoomState: vi.fn() }));
vi.mock('@/shared/auth-logout', () => ({ prepareForAuthLogout: vi.fn() }));
vi.mock('@/shared/stores/suspended-room-store', () => ({
  setCurrentSuspendedRoomToken: vi.fn(),
}));

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

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', createMemoryStorage());
});

describe('auth store token hydration', () => {
  it('hydrates once and keeps using the tab-local token', async () => {
    localStorage.setItem('token', 'tab-a-token');
    mocks.apiGet.mockResolvedValue({
      id: 'user-a',
      username: 'user-a',
      nickname: 'User A',
      avatarUrl: null,
      role: 'normal',
    });
    const { useAuthStore } = await import('../src/features/auth/stores/auth-store');

    localStorage.setItem('token', 'tab-b-token');
    await useAuthStore.getState().loadUser();

    expect(useAuthStore.getState().token).toBe('tab-a-token');
    expect(useAuthStore.getState().user?.id).toBe('user-a');
  });

  it.each([
    ['GitHub callback', (store: { login: (code: string) => Promise<unknown> }) => store.login('code')],
    ['development login', (store: { devLogin: (username: string) => Promise<void> }) => store.devLogin('alice')],
  ])('clears loading after a failed %s', async (_label, run) => {
    mocks.apiPost.mockRejectedValueOnce(new Error('network down'));
    const { useAuthStore } = await import('../src/features/auth/stores/auth-store');

    await expect(run(useAuthStore.getState())).rejects.toThrow('network down');
    expect(useAuthStore.getState()).toMatchObject({ loading: false, initialized: true });
  });
});

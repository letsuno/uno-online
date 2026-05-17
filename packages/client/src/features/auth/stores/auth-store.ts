import { create } from 'zustand';
import { apiPost, apiGet, UnauthorizedError } from '@/shared/api';

interface User {
  id: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  role: string;
}

export interface BindInfo {
  username: string;
  githubId: string;
  githubAvatarUrl?: string;
}

interface CallbackResult {
  isNewUser?: boolean;
  needsBind?: BindInfo;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  initialized: boolean;
  authError: string | null;
  login: (code: string) => Promise<CallbackResult>;
  bindGithub: (username: string, password: string, githubId: string, githubAvatarUrl?: string) => Promise<void>;
  devLogin: (username: string) => Promise<void>;
  register: (username: string, password: string, nickname: string, avatar?: string) => Promise<void>;
  passwordLogin: (username: string, password: string) => Promise<void>;
  loadUser: () => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  loading: false,
  initialized: false,
  authError: null,

  login: async (code: string) => {
    set({ loading: true });
    const data = await apiPost<{ token?: string; user?: User; isNewUser?: boolean; needsBind?: boolean; username?: string; githubId?: string; githubAvatarUrl?: string }>('/auth/callback', { code });

    if (data.needsBind && data.username && data.githubId) {
      set({ loading: false, initialized: true, authError: null });
      return { needsBind: { username: data.username, githubId: data.githubId, githubAvatarUrl: data.githubAvatarUrl } };
    }

    localStorage.setItem('token', data.token!);
    set({ user: data.user!, token: data.token!, loading: false, initialized: true, authError: null });
    return { isNewUser: data.isNewUser };
  },

  bindGithub: async (username: string, password: string, githubId: string, githubAvatarUrl?: string) => {
    set({ loading: true });
    try {
      const data = await apiPost<{ token: string; user: User }>('/auth/bind-github', { username, password, githubId, githubAvatarUrl });
      localStorage.setItem('token', data.token);
      set({ user: data.user, token: data.token, loading: false, initialized: true, authError: null });
    } catch (e) {
      set({ loading: false, initialized: true });
      throw e;
    }
  },

  devLogin: async (username: string) => {
    set({ loading: true });
    const data = await apiPost<{ token: string; user: User }>('/auth/dev-login', { username });
    localStorage.setItem('token', data.token);
    set({ user: data.user, token: data.token, loading: false, initialized: true, authError: null });
  },

  register: async (username: string, password: string, nickname: string, avatar?: string) => {
    set({ loading: true });
    try {
      const data = await apiPost<{ token: string; user: User }>('/auth/register', { username, password, nickname, avatar });
      localStorage.setItem('token', data.token);
      set({ user: data.user, token: data.token, loading: false, initialized: true, authError: null });
    } catch (e) {
      set({ loading: false, initialized: true });
      throw e;
    }
  },

  passwordLogin: async (username: string, password: string) => {
    set({ loading: true });
    try {
      const data = await apiPost<{ token: string; user: User }>('/auth/login', { username, password });
      localStorage.setItem('token', data.token);
      set({ user: data.user, token: data.token, loading: false, initialized: true, authError: null });
    } catch (e) {
      set({ loading: false, initialized: true });
      throw e;
    }
  },

  loadUser: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ user: null, token: null, loading: false, initialized: true, authError: null });
      return;
    }
    set({ loading: true, authError: null });
    try {
      const user = await apiGet<User>('/auth/me');
      set({ user, token, loading: false, initialized: true, authError: null });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        localStorage.removeItem('token');
        set({ user: null, token: null, loading: false, initialized: true, authError: null });
        return;
      }
      set({
        user: null,
        token,
        loading: false,
        initialized: true,
        authError: error instanceof Error ? error.message : 'Failed to restore session',
      });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null, loading: false, initialized: true, authError: null });
  },

  setUser: (user: User) => set({ user }),
}));

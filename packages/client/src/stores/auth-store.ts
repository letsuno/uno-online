import { create } from 'zustand';
import { apiPost, apiGet } from '../api';

interface User {
  id: string;
  username: string;
  avatarUrl: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (code: string) => Promise<void>;
  devLogin: (username: string) => Promise<void>;
  loadUser: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  loading: false,

  login: async (code: string) => {
    set({ loading: true });
    const data = await apiPost<{ token: string; user: User }>('/auth/callback', { code });
    localStorage.setItem('token', data.token);
    set({ user: data.user, token: data.token, loading: false });
  },

  devLogin: async (username: string) => {
    set({ loading: true });
    const data = await apiPost<{ token: string; user: User }>('/auth/dev-login', { username });
    localStorage.setItem('token', data.token);
    set({ user: data.user, token: data.token, loading: false });
  },

  loadUser: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    set({ loading: true });
    try {
      const user = await apiGet<User>('/auth/me');
      set({ user, token, loading: false });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, loading: false });
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },
}));

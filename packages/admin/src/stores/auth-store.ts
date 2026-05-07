import { create } from 'zustand';
import { apiFetch } from '@/lib/api';

interface User {
  id: string;
  username: string;
  nickname: string;
  role: string;
}

interface JwtPayload {
  userId: string;
  username: string;
  nickname: string;
  role: string;
  exp: number;
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1]!;
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

interface AuthState {
  token: string | null;
  user: User | null;
  error: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  init: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  error: null,
  loading: false,

  init: () => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;
    const payload = decodeJwt(token);
    if (!payload) {
      localStorage.removeItem('admin_token');
      return;
    }
    // Check expiry
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('admin_token');
      return;
    }
    if (payload.role !== 'admin') {
      localStorage.removeItem('admin_token');
      set({ error: 'This account does not have admin access' });
      return;
    }
    set({
      token,
      user: {
        id: payload.userId,
        username: payload.username,
        nickname: payload.nickname,
        role: payload.role,
      },
    });
  },

  login: async (username: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      const payload = decodeJwt(data.token);
      if (!payload || payload.role !== 'admin') {
        set({ loading: false, error: 'This account does not have admin access' });
        return false;
      }

      localStorage.setItem('admin_token', data.token);
      set({
        token: data.token,
        user: {
          id: payload.userId,
          username: payload.username,
          nickname: payload.nickname,
          role: payload.role,
        },
        loading: false,
      });
      return true;
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Login failed',
      });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('admin_token');
    set({ token: null, user: null, error: null });
  },
}));

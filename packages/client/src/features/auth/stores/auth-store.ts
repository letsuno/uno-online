import { create } from 'zustand';
import { apiPost, apiGet, apiDelete, UnauthorizedError } from '@/shared/api';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { isSessionTakenOver, resetSessionTakeover } from '@/shared/session-takeover';
import { resetClientRoomState } from '@/shared/stores/reset-room';

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
  register: (username: string, password: string, nickname: string, avatar?: string, turnstileToken?: string) => Promise<void>;
  passwordLogin: (username: string, password: string, turnstileToken?: string) => Promise<void>;
  loadUser: () => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  passkeyLogin: () => Promise<void>;
  getPasskeys: () => Promise<{ id: string; name: string; createdAt: string }[]>;
  registerPasskey: (name: string) => Promise<{ id: string; name: string; createdAt: string }>;
  deletePasskey: (id: string) => Promise<void>;
}

// 显式登录成功的统一落点：写入共享 token，并解除"会话被接管"标志——
// 用户主动登录意味着由本页接管会话（对方标签页会被踢下线）。
function storeToken(token: string): void {
  localStorage.setItem('token', token);
  resetSessionTakeover();
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

    storeToken(data.token!);
    set({ user: data.user!, token: data.token!, loading: false, initialized: true, authError: null });
    return { isNewUser: data.isNewUser };
  },

  bindGithub: async (username: string, password: string, githubId: string, githubAvatarUrl?: string) => {
    set({ loading: true });
    try {
      const data = await apiPost<{ token: string; user: User }>('/auth/bind-github', { username, password, githubId, githubAvatarUrl });
      storeToken(data.token);
      set({ user: data.user, token: data.token, loading: false, initialized: true, authError: null });
    } catch (e) {
      set({ loading: false, initialized: true });
      throw e;
    }
  },

  devLogin: async (username: string) => {
    set({ loading: true });
    const data = await apiPost<{ token: string; user: User }>('/auth/dev-login', { username });
    storeToken(data.token);
    set({ user: data.user, token: data.token, loading: false, initialized: true, authError: null });
  },

  register: async (username: string, password: string, nickname: string, avatar?: string, turnstileToken?: string) => {
    set({ loading: true });
    try {
      const data = await apiPost<{ token: string; user: User }>('/auth/register', { username, password, nickname, avatar, turnstileToken });
      storeToken(data.token);
      set({ user: data.user, token: data.token, loading: false, initialized: true, authError: null });
    } catch (e) {
      set({ loading: false, initialized: true });
      throw e;
    }
  },

  passwordLogin: async (username: string, password: string, turnstileToken?: string) => {
    set({ loading: true });
    try {
      const data = await apiPost<{ token: string; user: User }>('/auth/login', { username, password, turnstileToken });
      storeToken(data.token);
      set({ user: data.user, token: data.token, loading: false, initialized: true, authError: null });
    } catch (e) {
      set({ loading: false, initialized: true });
      throw e;
    }
  },

  loadUser: async () => {
    // 会话已被另一标签页接管：静默恢复会重建连接并反踢对方，只有显式
    // 登录（下方各 login 成功路径会重置标志）才允许在本页继续。
    if (isSessionTakenOver()) {
      set({ user: null, token: null, loading: false, initialized: true, authError: null });
      return;
    }
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
    // 模块级 zustand store 跨登录会话存活——不清理的话,同一 SPA 实例里
    // 下一个登录的账号会继承上一账号的完整对局快照(含手牌)。
    resetClientRoomState();
  },

  setUser: (user: User) => set({ user }),

  passkeyLogin: async () => {
    set({ loading: true });
    try {
      const { options, challengeId } = await apiPost<{ options: any; challengeId: string }>('/auth/passkey/login-options', {});
      const credential = await startAuthentication({ optionsJSON: options });
      const data = await apiPost<{ token: string; user: User }>('/auth/passkey/login-verify', { credential, challengeId });
      storeToken(data.token);
      set({ user: data.user, token: data.token, loading: false, initialized: true, authError: null });
    } catch (e) {
      set({ loading: false, initialized: true });
      throw e;
    }
  },

  getPasskeys: async () => {
    return apiGet<{ id: string; name: string; createdAt: string }[]>('/auth/passkey/list');
  },

  registerPasskey: async (name: string) => {
    const options = await apiPost<any>('/auth/passkey/register-options', {});
    const credential = await startRegistration({ optionsJSON: options });
    const result = await apiPost<{ success: boolean; passkey: { id: string; name: string; createdAt: string } }>('/auth/passkey/register-verify', { credential, name });
    return result.passkey;
  },

  deletePasskey: async (id: string) => {
    await apiDelete(`/auth/passkey/${id}`);
  },
}));

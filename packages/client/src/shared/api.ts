import { getApiUrl } from './env';
import { useAuthStore } from '@/features/auth/stores/auth-store';

export class UnauthorizedError extends Error {
  constructor() {
    super('Session expired, please sign in again');
    this.name = 'UnauthorizedError';
  }
}

export function clearStoredAuthToken(): void {
  localStorage.removeItem('token');
}

function notifyUnauthorized(): void {
  clearStoredAuthToken();
  window.dispatchEvent(new Event('auth:unauthorized'));
}

function authHeaders(): Record<string, string> {
  // 与 socket 层同源(内存优先):localStorage 是多标签页共享的,另一
  // 标签页换账号后若仍直接读它,本页会出现 WS 以 A 打牌、REST 以 B 改
  // 资料的身份分裂。
  const token = useAuthStore.getState().token ?? localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    notifyUnauthorized();
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(data.error ?? `API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    headers: authHeaders(),
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse<T>(res);
}

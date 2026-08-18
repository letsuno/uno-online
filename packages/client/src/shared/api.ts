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

function clearStoredAuthTokenIfMatches(attemptedToken: string | null): void {
  if (attemptedToken && localStorage.getItem('token') === attemptedToken) {
    localStorage.removeItem('token');
  }
}

function notifyUnauthorized(attemptedToken: string | null): void {
  // localStorage is shared across tabs. A stale request from a tab that has
  // already been taken over must not erase the replacement tab's token.
  clearStoredAuthTokenIfMatches(attemptedToken);
  window.dispatchEvent(new Event('auth:unauthorized'));
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response, attemptedToken: string | null): Promise<T> {
  if (res.status === 401) {
    notifyUnauthorized(attemptedToken);
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, string>;
    throw new Error(data.error ?? `API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res, token);
}

export async function apiPatch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res, token);
}

export async function apiGet<T>(path: string): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    headers: authHeaders(token),
  });
  return handleResponse<T>(res, token);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  return handleResponse<T>(res, token);
}

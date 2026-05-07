import { getApiUrl } from './env';

export async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${getApiUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(data.error ?? `API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${getApiUrl()}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(data.error ?? `API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${getApiUrl()}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

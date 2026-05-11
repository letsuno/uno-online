import type { UserIdentity } from './types.js';

export async function verifyApiKey(serverUrl: string, apiKey: string): Promise<UserIdentity> {
  const res = await fetch(`${serverUrl}/api/api-keys/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: apiKey }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(data.error ?? `API Key 验证失败: ${res.status}`);
  }
  return res.json() as Promise<UserIdentity>;
}

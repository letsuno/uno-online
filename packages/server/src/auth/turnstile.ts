const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token: string, secretKey: string, remoteip?: string): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret: secretKey, response: token });
    if (remoteip) body.set('remoteip', remoteip);
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body });
    const data = await res.json() as { success: boolean };
    return data.success;
  } catch {
    return false;
  }
}

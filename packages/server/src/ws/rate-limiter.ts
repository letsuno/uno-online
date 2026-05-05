const rateLimits = new Map<string, { count: number; resetAt: number }>();

const MAX_MESSAGES_PER_SECOND = 20;

export function checkRateLimit(socketId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(socketId);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(socketId, { count: 1, resetAt: now + 1000 });
    return true;
  }

  entry.count++;
  if (entry.count > MAX_MESSAGES_PER_SECOND) {
    return false;
  }
  return true;
}

export function clearRateLimit(socketId: string): void {
  rateLimits.delete(socketId);
}

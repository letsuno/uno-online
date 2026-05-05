import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(url?: string): Redis {
  if (!redis) {
    redis = new Redis(url ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
    });
  }
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

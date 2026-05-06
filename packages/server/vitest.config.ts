import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
    env: {
      REDIS_URL: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
    env: {
      REDIS_URL: 'redis://:123456@localhost:6379',
    },
  },
});

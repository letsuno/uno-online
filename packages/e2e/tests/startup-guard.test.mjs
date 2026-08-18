import assert from 'node:assert/strict';
import test from 'node:test';
import { onceAsync, withStartupCleanup } from '../lib/startup-guard.mjs';

test('a startup failure awaits cleanup before it is rethrown', async () => {
  const order = [];
  const startupError = new Error('health check failed');
  const cleanup = onceAsync(async () => {
    await Promise.resolve();
    order.push('cleanup');
  });

  await assert.rejects(
    withStartupCleanup(async () => {
      order.push('startup');
      throw startupError;
    }, cleanup),
    error => error === startupError,
  );
  assert.deepEqual(order, ['startup', 'cleanup']);
});

test('cleanup is idempotent across startup catch and caller finally paths', async () => {
  let cleanupCalls = 0;
  const cleanup = onceAsync(async () => {
    cleanupCalls += 1;
  });

  await assert.rejects(
    withStartupCleanup(async () => {
      throw new Error('spawn failed');
    }, cleanup),
    /spawn failed/u,
  );
  await Promise.all([cleanup(), cleanup(), cleanup()]);
  assert.equal(cleanupCalls, 1);
});

test('cleanup failure preserves both startup and cleanup errors', async () => {
  await assert.rejects(
    withStartupCleanup(
      async () => {
        throw new Error('startup');
      },
      async () => {
        throw new Error('cleanup');
      },
    ),
    error =>
      error instanceof AggregateError &&
      error.errors.some(item => item.message === 'startup') &&
      error.errors.some(item => item.message === 'cleanup'),
  );
});

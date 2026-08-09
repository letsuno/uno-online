import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import { assertPortAvailable } from '../lib/port-guard.mjs';

async function listen(server, host, port = 0) {
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen({ host, port, exclusive: true }, resolvePromise);
  });
}

async function close(server) {
  await new Promise((resolvePromise, rejectPromise) => {
    server.close(error => (error ? rejectPromise(error) : resolvePromise()));
  });
}

test('accepts a free harness port', async () => {
  const holder = createServer();
  await listen(holder, '127.0.0.1');
  const address = holder.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await close(holder);

  await assert.doesNotReject(assertPortAvailable('127.0.0.1', port, '测试'));
});

test('rejects a harness port owned by another process', async () => {
  const holder = createServer();
  await listen(holder, '127.0.0.1');
  const address = holder.address();
  assert.ok(address && typeof address === 'object');

  try {
    await assert.rejects(assertPortAvailable('127.0.0.1', address.port, '客户端'), /客户端 端口已被占用/u);
  } finally {
    await close(holder);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLocalHarnessConfig, resolveHarnessConfig } from '../lib/harness-config.mjs';

test('uses the default local origins and ports', () => {
  assert.deepEqual(resolveHarnessConfig({}), {
    clientUrl: 'http://127.0.0.1:5173',
    clientPort: 5173,
    serverPort: 3001,
  });
});

test('a client-port override updates the URL consumed by browser and health checks', () => {
  assert.deepEqual(resolveHarnessConfig({ UNO_E2E_CLIENT_PORT: '5273' }), {
    clientUrl: 'http://127.0.0.1:5273',
    clientPort: 5273,
    serverPort: 3001,
  });
});

test('an explicit URL is the source of its launch port', () => {
  assert.deepEqual(resolveHarnessConfig({ UNO_CLIENT_URL: 'http://localhost:5288/' }), {
    clientUrl: 'http://localhost:5288',
    clientPort: 5288,
    serverPort: 3001,
  });
});

test('a URL without an explicit port uses the protocol default instead of port zero', () => {
  assert.equal(resolveHarnessConfig({ UNO_CLIENT_URL: 'http://127.0.0.1' }).clientPort, 80);
  assert.equal(resolveHarnessConfig({ UNO_CLIENT_URL: 'https://example.test' }).clientPort, 443);
});

test('accepts matching URL and port overrides', () => {
  const config = resolveHarnessConfig({
    UNO_CLIENT_URL: 'http://127.0.0.1:5199',
    UNO_E2E_CLIENT_PORT: '5199',
    UNO_E2E_SERVER_PORT: '3199',
  });
  assert.equal(config.clientUrl, 'http://127.0.0.1:5199');
  assert.equal(config.clientPort, 5199);
  assert.equal(config.serverPort, 3199);
});

test('rejects conflicting URL and launch ports before spawning services', () => {
  assert.throws(
    () =>
      resolveHarnessConfig({
        UNO_CLIENT_URL: 'http://127.0.0.1:5173',
        UNO_E2E_CLIENT_PORT: '5273',
      }),
    /不一致/u,
  );
});

test('rejects invalid ports and non-origin client URLs', () => {
  for (const value of ['', '0', '-1', 'abc', '65536']) {
    assert.throws(() => resolveHarnessConfig({ UNO_E2E_CLIENT_PORT: value }), /1-65535/u);
  }
  assert.throws(
    () => resolveHarnessConfig({ UNO_CLIENT_URL: 'http://127.0.0.1:5173/game/ABC123' }),
    /必须是无认证信息、路径、查询或锚点的 origin/u,
  );
});

test('local service startup rejects remote and TLS targets before spawning', () => {
  assert.throws(
    () => assertLocalHarnessConfig(resolveHarnessConfig({ UNO_CLIENT_URL: 'http://example.test' })),
    /仅支持 loopback/u,
  );
  assert.throws(
    () => assertLocalHarnessConfig(resolveHarnessConfig({ UNO_CLIENT_URL: 'https://localhost' })),
    /只能启动 http Vite/u,
  );
  assert.doesNotThrow(() => assertLocalHarnessConfig(resolveHarnessConfig({ UNO_CLIENT_URL: 'http://localhost' })));
});

import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/index.js';

const requiredArgs = ['--api-key=test-key', '--server=https://uno.example.com/'];

describe('parseConfig', () => {
  it('parses and normalizes a strict stdio configuration', () => {
    expect(parseConfig(requiredArgs, {})).toEqual({
      apiKey: 'test-key',
      serverUrl: 'https://uno.example.com',
      mode: 'stdio',
      httpPort: 3002,
    });
  });

  it('accepts an explicit HTTP mode and port', () => {
    expect(parseConfig([...requiredArgs, '--mode=http', '--port=4312'], {})).toMatchObject({
      mode: 'http',
      httpPort: 4312,
    });
  });

  it('uses environment variables for credentials and server URL', () => {
    expect(
      parseConfig([], {
        UNO_API_KEY: 'env-key',
        UNO_SERVER_URL: 'http://127.0.0.1:3001/',
      }),
    ).toMatchObject({
      apiKey: 'env-key',
      serverUrl: 'http://127.0.0.1:3001',
    });
  });

  it('rejects unknown options and positional arguments', () => {
    expect(() => parseConfig([...requiredArgs, '--typo=value'], {})).toThrow();
    expect(() => parseConfig([...requiredArgs, 'unexpected'], {})).toThrow();
  });

  it.each(['websocket', 'HTTP', ''])('rejects unsupported mode %j', mode => {
    expect(() => parseConfig([...requiredArgs, `--mode=${mode}`], {})).toThrow('无效的传输模式');
  });

  it.each(['0', '65536', '3002junk', '3.5', '-1'])('rejects invalid port %j', port => {
    expect(() => parseConfig([...requiredArgs, `--port=${port}`], {})).toThrow(/HTTP 端口/);
  });

  it.each([
    'not-a-url',
    'ftp://uno.example.com',
    'https://user:password@uno.example.com',
    'https://uno.example.com?token=secret',
    'https://uno.example.com/#fragment',
  ])('rejects invalid server URL %j', serverUrl => {
    expect(() => parseConfig(['--api-key=test-key', `--server=${serverUrl}`], {})).toThrow(/URL/);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

function setProductionEnvironment(jwtSecret: string): void {
  vi.stubEnv('DEV_MODE', 'false');
  vi.stubEnv('JWT_SECRET', jwtSecret);
  vi.stubEnv('GITHUB_CLIENT_ID', 'client-id');
  vi.stubEnv('GITHUB_CLIENT_SECRET', 'client-secret');
}

describe('server security configuration', () => {
  it('rejects documented placeholder secrets in production', () => {
    setProductionEnvironment('please-change-this-to-a-random-string-at-least-32-chars');
    expect(() => loadConfig()).toThrow('unique random string of at least 32 characters');
  });

  it('rejects short secrets in production', () => {
    setProductionEnvironment('short-secret');
    expect(() => loadConfig()).toThrow('unique random string of at least 32 characters');
  });

  it('accepts a strong production secret and keeps development mode disabled', () => {
    setProductionEnvironment('test-only-random-production-secret-1234567890');
    expect(loadConfig()).toMatchObject({
      devMode: false,
      jwtSecret: 'test-only-random-production-secret-1234567890',
    });
  });

  it('allows a short secret only in explicit development mode', () => {
    vi.stubEnv('DEV_MODE', 'true');
    vi.stubEnv('JWT_SECRET', 'dev-secret');
    expect(loadConfig()).toMatchObject({ devMode: true, jwtSecret: 'dev-secret' });
  });
});
